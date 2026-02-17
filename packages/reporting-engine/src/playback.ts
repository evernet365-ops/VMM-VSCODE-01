import { performance } from "node:perf_hooks";
import { Pool } from "pg";
import type { ServiceMetrics } from "@evernet/shared";

export interface PlaybackQuery {
  siteId: string;
  cameraId: string;
  start: string;
  end: string;
  page: number;
  pageSize: number;
}

export interface PlaybackRecord {
  ts: string;
  file: string;
  durationSec: number;
}

export interface PlaybackResult {
  source: "index" | "fallback";
  items: PlaybackRecord[];
  nextPage?: number;
  total?: number;
  windowApplied?: { start: string; end: string };
  pageSizeApplied?: number;
  slowQueryMs?: number;
  cacheHit?: boolean;
}

const MAX_PAGE_SIZE = 50;
const MAX_WINDOW_HOURS = 24;
const SLOW_MS = 800;
const DEFAULT_FALLBACK_MAX_PAGES = 5;

type PlaybackRuntimeOptions = {
  enableTunable: boolean;
  fallbackWindowSec: number;
  fallbackMaxPages: number;
  slowMs: number;
  slowAlertThreshold: number;
  enableCache: boolean;
  cacheTtlMs: number;
  cacheMaxEntries: number;
  cacheHotWindows: string[];
};

type PlaybackCacheEntry = {
  value: PlaybackResult;
  expiresAt: number;
};

const playbackCache = new Map<string, PlaybackCacheEntry>();
const slowCountBySite = new Map<string, number>();

function normalizeOptions(options?: Partial<PlaybackRuntimeOptions>): PlaybackRuntimeOptions {
  return {
    enableTunable: Boolean(options?.enableTunable),
    fallbackWindowSec: Math.max(60, Math.floor(options?.fallbackWindowSec ?? 3600)),
    fallbackMaxPages: Math.max(1, Math.floor(options?.fallbackMaxPages ?? DEFAULT_FALLBACK_MAX_PAGES)),
    slowMs: Math.max(50, Math.floor(options?.slowMs ?? SLOW_MS)),
    slowAlertThreshold: Math.max(1, Math.floor(options?.slowAlertThreshold ?? 10)),
    enableCache: Boolean(options?.enableCache),
    cacheTtlMs: Math.max(1000, Math.floor(options?.cacheTtlMs ?? 300000)),
    cacheMaxEntries: Math.max(1, Math.floor(options?.cacheMaxEntries ?? 1000)),
    cacheHotWindows: (options?.cacheHotWindows ?? ["15m", "1h"]).map((value) => value.trim()).filter(Boolean)
  };
}

function clampPageSize(pageSize: number): number {
  if (Number.isNaN(pageSize) || pageSize <= 0) return 10;
  return Math.min(pageSize, MAX_PAGE_SIZE);
}

function parseHotWindowToMs(raw: string): number | undefined {
  if (raw.endsWith("m")) {
    const minutes = Number(raw.slice(0, -1));
    return Number.isFinite(minutes) && minutes > 0 ? minutes * 60 * 1000 : undefined;
  }
  if (raw.endsWith("h")) {
    const hours = Number(raw.slice(0, -1));
    return Number.isFinite(hours) && hours > 0 ? hours * 60 * 60 * 1000 : undefined;
  }
  return undefined;
}

function shouldCacheByWindow(start: string, end: string, hotWindows: string[]): boolean {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return false;
  }
  const durationMs = endMs - startMs;
  const targets = hotWindows
    .map((window) => parseHotWindowToMs(window))
    .filter((value): value is number => value !== undefined);
  if (targets.length === 0) {
    return true;
  }
  return targets.some((target) => Math.abs(durationMs - target) <= 60_000);
}

function clampWindow(
  start: string,
  end: string,
  options: PlaybackRuntimeOptions
): { start: string; end: string } {
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    const fallbackEnd = new Date();
    const fallbackWindowMs = options.enableTunable
      ? options.fallbackWindowSec * 1000
      : 60 * 60 * 1000;
    const fallbackStart = new Date(fallbackEnd.getTime() - fallbackWindowMs);
    return { start: fallbackStart.toISOString(), end: fallbackEnd.toISOString() };
  }
  const maxMs = options.enableTunable
    ? options.fallbackWindowSec * 1000
    : MAX_WINDOW_HOURS * 60 * 60 * 1000;
  if (endDate.getTime() - startDate.getTime() > maxMs) {
    const trimmedStart = new Date(endDate.getTime() - maxMs);
    return { start: trimmedStart.toISOString(), end: endDate.toISOString() };
  }
  return { start: startDate.toISOString(), end: endDate.toISOString() };
}

function buildCacheKey(q: PlaybackQuery, pageSize: number, start: string, end: string): string {
  return [q.siteId, q.cameraId, start, end, q.page, pageSize].join("|");
}

function maybeReadCache(
  key: string,
  nowMs: number
): { hit: true; value: PlaybackResult } | { hit: false; expired: boolean } {
  const entry = playbackCache.get(key);
  if (!entry) {
    return { hit: false, expired: false };
  }
  if (entry.expiresAt <= nowMs) {
    playbackCache.delete(key);
    return { hit: false, expired: true };
  }
  playbackCache.delete(key);
  playbackCache.set(key, entry);
  return { hit: true, value: entry.value };
}

function writeCache(
  key: string,
  value: PlaybackResult,
  nowMs: number,
  options: PlaybackRuntimeOptions
): { evicted: boolean } {
  playbackCache.set(key, { value, expiresAt: nowMs + options.cacheTtlMs });
  if (playbackCache.size <= options.cacheMaxEntries) {
    return { evicted: false };
  }
  const oldestKey = playbackCache.keys().next().value as string | undefined;
  if (oldestKey) {
    playbackCache.delete(oldestKey);
    return { evicted: true };
  }
  return { evicted: false };
}

async function queryIndex(
  db: Pool,
  q: PlaybackQuery,
  options: PlaybackRuntimeOptions
): Promise<PlaybackResult> {
  const pageSize = clampPageSize(q.pageSize);
  const offset = q.page * pageSize;
  const { start, end } = clampWindow(q.start, q.end, options);

  const res = await db.query(
    `select ts_event as ts, metadata_json ->> 'file' as file, coalesce((metadata_json ->> 'durationSec')::int, 0) as durationSec
     from ai_event
     where site_id = $1
       and camera_id = $2
       and event_type = 'recording'
       and ts_event between $3 and $4
     order by ts_event asc
     limit $5 offset $6`,
    [q.siteId, q.cameraId, start, end, pageSize, offset]
  );

  return {
    source: "index",
    items: res.rows as PlaybackRecord[],
    nextPage: res.rowCount === pageSize ? q.page + 1 : undefined,
    windowApplied: { start, end },
    pageSizeApplied: pageSize
  };
}

async function scanFiles(_q: PlaybackQuery): Promise<PlaybackRecord[]> {
  // In absence of a real file index, return a bounded mock dataset.
  return [
    { ts: new Date().toISOString(), file: "/recordings/fallback-1.mp4", durationSec: 30 },
    { ts: new Date(Date.now() - 30_000).toISOString(), file: "/recordings/fallback-2.mp4", durationSec: 45 }
  ];
}

export async function playbackWithFallback(
  db: Pool,
  metrics: ServiceMetrics,
  serviceName: string,
  q: PlaybackQuery,
  enableFallback: boolean,
  options?: Partial<PlaybackRuntimeOptions>
): Promise<PlaybackResult> {
  const runtime = normalizeOptions(options);
  const labels = [serviceName, q.siteId] as const;
  const start = performance.now();
  const pageSize = clampPageSize(q.pageSize);
  const appliedWindow = clampWindow(q.start, q.end, runtime);
  const maxPages = runtime.enableTunable ? runtime.fallbackMaxPages : DEFAULT_FALLBACK_MAX_PAGES;
  const appliedPage = Math.max(0, Math.min(q.page, maxPages - 1));
  const normalizedQuery: PlaybackQuery = {
    ...q,
    page: appliedPage,
    pageSize,
    start: appliedWindow.start,
    end: appliedWindow.end
  };
  const cacheKey = buildCacheKey(normalizedQuery, pageSize, appliedWindow.start, appliedWindow.end);
  const canCache = runtime.enableCache && shouldCacheByWindow(appliedWindow.start, appliedWindow.end, runtime.cacheHotWindows);
  const nowMs = Date.now();

  if (canCache) {
    const cacheResult = maybeReadCache(cacheKey, nowMs);
    if (cacheResult.hit) {
      metrics.playbackCacheHitsTotal.labels(...labels).inc();
      return { ...cacheResult.value, cacheHit: true };
    }
    metrics.playbackCacheMissTotal.labels(...labels).inc();
    if (cacheResult.expired) {
      metrics.playbackCacheTtlExpiredTotal.labels(...labels).inc();
    }
  }

  try {
    const result = await queryIndex(db, normalizedQuery, runtime);
    const duration = performance.now() - start;
    metrics.playbackScanDurationMs.labels(...labels).observe(duration);
    if (duration > runtime.slowMs) {
      metrics.playbackSlowQueryTotal.labels(...labels).inc();
      const nextCount = (slowCountBySite.get(q.siteId) ?? 0) + 1;
      slowCountBySite.set(q.siteId, nextCount);
      if (nextCount % runtime.slowAlertThreshold === 0) {
        metrics.playbackSlowQueryAlertTotal.labels(...labels).inc();
      }
    }
    const response: PlaybackResult = {
      ...result,
      slowQueryMs: Math.round(duration),
      cacheHit: false
    };
    if (canCache) {
      const write = writeCache(cacheKey, response, nowMs, runtime);
      if (write.evicted) {
        metrics.playbackCacheEvictTotal.labels(...labels).inc();
      }
    }
    return response;
  } catch (error) {
    if (!enableFallback) {
      throw error;
    }
    const scanStart = performance.now();
    const items = await scanFiles(normalizedQuery);
    const duration = performance.now() - scanStart;
    metrics.playbackFallbackTotal.labels(...labels).inc();
    metrics.playbackScanDurationMs.labels(...labels).observe(duration);
    if (duration > runtime.slowMs) {
      metrics.playbackSlowQueryTotal.labels(...labels).inc();
      const nextCount = (slowCountBySite.get(q.siteId) ?? 0) + 1;
      slowCountBySite.set(q.siteId, nextCount);
      if (nextCount % runtime.slowAlertThreshold === 0) {
        metrics.playbackSlowQueryAlertTotal.labels(...labels).inc();
      }
    }
    const response: PlaybackResult = {
      source: "fallback",
      items,
      nextPage: normalizedQuery.page + 1 < maxPages ? normalizedQuery.page + 1 : undefined,
      total: items.length,
      windowApplied: appliedWindow,
      pageSizeApplied: pageSize,
      slowQueryMs: Math.round(duration),
      cacheHit: false
    };
    if (canCache) {
      const write = writeCache(cacheKey, response, nowMs, runtime);
      if (write.evicted) {
        metrics.playbackCacheEvictTotal.labels(...labels).inc();
      }
    }
    return response;
  }
}
