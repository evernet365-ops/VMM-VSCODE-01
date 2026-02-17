import Fastify from "fastify";
import {
  closeDbPool,
  createLogger,
  createServiceMetrics,
  getDbPool,
  loadServiceRuntimeConfig
} from "@evernet/shared";
import { playbackWithFallback, type PlaybackQuery } from "./playback.js";
import {
  queryChannelPerformance,
  queryDecisionOverview,
  queryRiskRanking,
  toManagementInterval,
  withManagementMetric
} from "./management-report.js";

const runtime = loadServiceRuntimeConfig("reporting-engine", Number(process.env.REPORTING_ENGINE_PORT ?? 3014));
const logger = createLogger(runtime.serviceName);
const metrics = createServiceMetrics(runtime.serviceName);
const db = getDbPool();
const app = Fastify({ logger: false });

function toInterval(window: string): string {
  const allowed = new Set(["15m", "1h", "4h", "8h", "24h"]);
  if (!allowed.has(window)) {
    return "1 hour";
  }
  if (window.endsWith("m")) {
    return `${Number(window.slice(0, -1))} minutes`;
  }
  return `${Number(window.slice(0, -1))} hours`;
}

app.addHook("onRequest", async (request) => {
  (request as { startedAt?: number }).startedAt = Date.now();
});

app.addHook("onResponse", async (request, reply) => {
  const start = (request as { startedAt?: number }).startedAt ?? Date.now();
  metrics.apiLatencyMs.labels(runtime.serviceName, request.url, request.method, String(reply.statusCode)).observe(Date.now() - start);
  metrics.dbConnections.labels(runtime.serviceName).set((db as unknown as { totalCount?: number }).totalCount ?? 0);
});

app.get("/healthz", async () => {
  await db.query("select 1");
  return { status: "ok", service: runtime.serviceName };
});

app.get("/metrics", async (_, reply) => {
  reply.header("content-type", metrics.registry.contentType);
  return metrics.registry.metrics();
});

app.get("/api/v1/sites/:siteId/reports/anomalies", async (request) => {
  const params = request.params as { siteId: string };
  const query = request.query as { window?: string };
  const window = toInterval(query.window ?? "1h");

  const result = await db.query(
    `select id, camera_id, event_type, severity, score, ts_event
     from ai_event
     where site_id = $1
       and severity in ('suspect', 'critical')
       and ts_event >= now() - ($2)::interval
     order by ts_event desc`,
    [params.siteId, window]
  );

  return {
    siteId: params.siteId,
    window,
    count: result.rowCount,
    items: result.rows
  };
});

app.get("/api/v1/sites/:siteId/reports/top-offline", async (request) => {
  const params = request.params as { siteId: string };
  const query = request.query as { window?: string };
  const window = toInterval(query.window ?? "24h");

  const result = await db.query(
    `select camera_id, count(*) as offline_count
     from ai_event
     where site_id = $1
       and event_type = 'offline'
       and ts_event >= now() - ($2)::interval
     group by camera_id
     order by offline_count desc
     limit 20`,
    [params.siteId, window]
  );

  return {
    siteId: params.siteId,
    window,
    top20: result.rows
  };
});

app.get("/api/v1/sites/:siteId/reports/top-missing-recording", async (request) => {
  const params = request.params as { siteId: string };
  const query = request.query as { window?: string };
  const window = toInterval(query.window ?? "24h");

  const result = await db.query(
    `select camera_id, count(*) as missing_count
     from ai_event
     where site_id = $1
       and event_type = 'missing_recording'
       and ts_event >= now() - ($2)::interval
     group by camera_id
     order by missing_count desc
     limit 20`,
    [params.siteId, window]
  );

  return {
    siteId: params.siteId,
    window,
    top20: result.rows
  };
});

app.get("/api/v1/sites/:siteId/reports/accumulated-offline", async (request) => {
  const params = request.params as { siteId: string };
  const query = request.query as { window?: string };
  const window = toInterval(query.window ?? "24h");

  const result = await db.query(
    `select
       camera_id,
       sum(coalesce((metadata_json ->> 'durationSec')::numeric, 0)) as total_offline_seconds
     from ai_event
     where site_id = $1
       and event_type = 'offline'
       and ts_event >= now() - ($2)::interval
     group by camera_id
     order by total_offline_seconds desc
     limit 20`,
    [params.siteId, window]
  );

  return {
    siteId: params.siteId,
    window,
    ranked: result.rows
  };
});

app.get("/api/v1/sites/:siteId/playback", async (request, reply) => {
  const params = request.params as { siteId: string; cameraId?: string };
  const query = request.query as { cameraId?: string; start?: string; end?: string; page?: string; pageSize?: string };

  const cameraId = query.cameraId ?? params.cameraId;
  if (!cameraId) {
    reply.status(400);
    return { error: "cameraId is required" };
  }

  const playbackQuery: PlaybackQuery = {
    siteId: params.siteId,
    cameraId,
    start: query.start ?? new Date(Date.now() - 3_600_000).toISOString(),
    end: query.end ?? new Date().toISOString(),
    page: Number(query.page ?? "0"),
    pageSize: Number(query.pageSize ?? "10")
  };

  const enableFallback = runtime.enablePlaybackFallbackScan ?? false;

  try {
    const result = await playbackWithFallback(
      db,
      metrics,
      runtime.serviceName,
      playbackQuery,
      enableFallback,
      {
        enableTunable: runtime.enablePlaybackFallbackTunable ?? false,
        fallbackWindowSec: runtime.playbackFallbackWindowSec ?? 3600,
        fallbackMaxPages: runtime.playbackFallbackMaxPages ?? 5,
        slowMs: runtime.playbackSlowMs ?? 800,
        slowAlertThreshold: runtime.playbackSlowAlertThreshold ?? 10,
        enableCache: runtime.enablePlaybackCache ?? false,
        cacheTtlMs: runtime.playbackCacheTtlMs ?? 300000,
        cacheMaxEntries: runtime.playbackCacheMaxEntries ?? 1000,
        cacheHotWindows: String(runtime.playbackCacheHotWindows ?? "15m,1h")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      }
    );
    return {
      siteId: params.siteId,
      cameraId,
      source: result.source,
      items: result.items,
      nextPage: result.nextPage,
      total: result.total,
      windowApplied: result.windowApplied,
      pageSizeApplied: result.pageSizeApplied,
      slowQueryMs: result.slowQueryMs,
      cacheHit: result.cacheHit
    };
  } catch (error) {
    logger.error("playback query failed", { error: String(error) });
    reply.status(503);
    return { error: enableFallback ? "playback unavailable" : "playback index unavailable" };
  }
});

app.get("/api/v1/sites/:siteId/reports/management/overview", async (request) => {
  const params = request.params as { siteId: string };
  const query = request.query as { window?: string };

  if (!(runtime.enableManagementReports ?? false)) {
    return {
      siteId: params.siteId,
      featureEnabled: false,
      data: null,
      note: "FEATURE_VMM_MANAGEMENT_REPORTS is disabled"
    };
  }

  const interval = toManagementInterval(query.window ?? "24h");
  const data = await withManagementMetric(metrics, runtime.serviceName, params.siteId, "overview", () =>
    queryDecisionOverview(db, params.siteId, interval)
  );
  logger.info("management overview queried", { siteId: params.siteId, interval });
  return { siteId: params.siteId, featureEnabled: true, interval, data };
});

app.get("/api/v1/sites/:siteId/reports/management/channel-performance", async (request) => {
  const params = request.params as { siteId: string };
  const query = request.query as { window?: string };

  if (!(runtime.enableManagementReports ?? false)) {
    return {
      siteId: params.siteId,
      featureEnabled: false,
      items: [],
      note: "FEATURE_VMM_MANAGEMENT_REPORTS is disabled"
    };
  }

  const interval = toManagementInterval(query.window ?? "24h");
  const items = await withManagementMetric(metrics, runtime.serviceName, params.siteId, "channel-performance", () =>
    queryChannelPerformance(db, params.siteId, interval)
  );
  logger.info("management channel performance queried", { siteId: params.siteId, interval });
  return { siteId: params.siteId, featureEnabled: true, interval, items };
});

app.get("/api/v1/sites/:siteId/reports/management/risk-ranking", async (request) => {
  const params = request.params as { siteId: string };
  const query = request.query as { window?: string };

  if (!(runtime.enableManagementReports ?? false)) {
    return {
      siteId: params.siteId,
      featureEnabled: false,
      top20: [],
      note: "FEATURE_VMM_MANAGEMENT_REPORTS is disabled"
    };
  }

  const interval = toManagementInterval(query.window ?? "24h");
  const top20 = await withManagementMetric(metrics, runtime.serviceName, params.siteId, "risk-ranking", () =>
    queryRiskRanking(db, params.siteId, interval)
  );
  logger.info("management risk ranking queried", { siteId: params.siteId, interval });
  return { siteId: params.siteId, featureEnabled: true, interval, top20 };
});

async function start(): Promise<void> {
  await app.listen({ host: "0.0.0.0", port: runtime.port });
  logger.info("service started", { port: runtime.port });
}

async function shutdown(signal: string): Promise<void> {
  logger.warn("shutdown signal", { signal });
  await app.close();
  await closeDbPool();
  process.exit(0);
}

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

start().catch(async (error) => {
  logger.error("service start failed", { error: String(error) });
  await closeDbPool();
  process.exit(1);
});
