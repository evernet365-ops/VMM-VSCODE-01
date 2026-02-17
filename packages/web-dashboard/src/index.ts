import Fastify from "fastify";
import {
  closeDbPool,
  createLogger,
  createServiceMetrics,
  getDbPool,
  loadServiceRuntimeConfig
} from "@evernet/shared";

const runtime = loadServiceRuntimeConfig("web-dashboard", Number(process.env.WEB_DASHBOARD_PORT ?? 3016));
const logger = createLogger(runtime.serviceName);
const metrics = createServiceMetrics(runtime.serviceName);
const db = getDbPool();
const app = Fastify({ logger: false });

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

app.get("/api/v1/sites/:siteId/dashboard/summary", async (request) => {
  const params = request.params as { siteId: string };

  const [offlineCameras, aiEvents, notifyRate] = await Promise.all([
    db.query(
      `select count(*)::int as offline_cameras
       from camera
       where site_id = $1
         and status = 'offline'`,
      [params.siteId]
    ),
    db.query(
      `select count(*)::int as ai_events_1h
       from ai_event
       where site_id = $1
         and ts_event >= now() - interval '1 hour'`,
      [params.siteId]
    ),
    db.query(
      `select
         coalesce(sum(case when status = 'sent' then 1 else 0 end), 0)::int as sent,
         coalesce(sum(case when status = 'failed' then 1 else 0 end), 0)::int as failed
       from notification_log
       where site_id = $1
         and created_at >= now() - interval '1 hour'`,
      [params.siteId]
    )
  ]);

  const sent = notifyRate.rows[0]?.sent ?? 0;
  const failed = notifyRate.rows[0]?.failed ?? 0;
  const total = sent + failed;

  return {
    siteId: params.siteId,
    summary: {
      offlineCameras: offlineCameras.rows[0]?.offline_cameras ?? 0,
      aiEvents1h: aiEvents.rows[0]?.ai_events_1h ?? 0,
      notificationSent1h: sent,
      notificationFailed1h: failed,
      notificationSuccessRate1h: total === 0 ? 1 : sent / total
    }
  };
});

app.get("/", async () => {
  return {
    service: runtime.serviceName,
    description: "EverNet VMM dashboard API",
    docs: "/api/v1/sites/:siteId/dashboard/summary"
  };
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
