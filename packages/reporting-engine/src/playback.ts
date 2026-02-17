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
}

const MAX_PAGE_SIZE = 50;
const MAX_WINDOW_HOURS = 24;
const SLOW_MS = 800;

function clampPageSize(pageSize: number): number {
  if (Number.isNaN(pageSize) || pageSize <= 0) return 10;
  return Math.min(pageSize, MAX_PAGE_SIZE);
}

function clampWindow(start: string, end: string): { start: string; end: string } {
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    const fallbackEnd = new Date();
    const fallbackStart = new Date(fallbackEnd.getTime() - 60 * 60 * 1000);
    return { start: fallbackStart.toISOString(), end: fallbackEnd.toISOString() };
  }
  const maxMs = MAX_WINDOW_HOURS * 60 * 60 * 1000;
  if (endDate.getTime() - startDate.getTime() > maxMs) {
    const trimmedStart = new Date(endDate.getTime() - maxMs);
    return { start: trimmedStart.toISOString(), end: endDate.toISOString() };
  }
  return { start: startDate.toISOString(), end: endDate.toISOString() };
}

async function queryIndex(db: Pool, q: PlaybackQuery): Promise<PlaybackResult> {
  const pageSize = clampPageSize(q.pageSize);
  const offset = q.page * pageSize;
  const { start, end } = clampWindow(q.start, q.end);

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
    nextPage: res.rowCount === pageSize ? q.page + 1 : undefined
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
  enableFallback: boolean
): Promise<PlaybackResult> {
  const labels = [serviceName, q.siteId] as const;
  const start = performance.now();

  try {
    const result = await queryIndex(db, q);
    const duration = performance.now() - start;
    metrics.playbackScanDurationMs.labels(...labels).observe(duration);
    if (duration > SLOW_MS) {
      metrics.playbackSlowQueryTotal.labels(...labels).inc();
    }
    return result;
  } catch (error) {
    if (!enableFallback) {
      throw error;
    }
    const scanStart = performance.now();
    const items = await scanFiles(q);
    const duration = performance.now() - scanStart;
    metrics.playbackFallbackTotal.labels(...labels).inc();
    metrics.playbackScanDurationMs.labels(...labels).observe(duration);
    if (duration > SLOW_MS) {
      metrics.playbackSlowQueryTotal.labels(...labels).inc();
    }
    return { source: "fallback", items, nextPage: undefined, total: items.length };
  }
}
