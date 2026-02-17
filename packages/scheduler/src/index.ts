import Fastify from "fastify";
import {
  createLogger,
  createServiceMetrics,
  getEnv,
  getNumberEnv,
  loadServiceRuntimeConfig,
  requestWithRetry
} from "@evernet/shared";

const runtime = loadServiceRuntimeConfig("scheduler", Number(process.env.SCHEDULER_PORT ?? 3015));
const logger = createLogger(runtime.serviceName);
const metrics = createServiceMetrics(runtime.serviceName);
const app = Fastify({ logger: false });

const gatewayUrl = getEnv("NOTIFICATION_GATEWAY_URL", "http://localhost:3010");
const reportingUrl = getEnv("REPORTING_ENGINE_URL", "http://localhost:3014");
const sites = (process.env.SCHEDULER_SITES ?? "site-a,site-b").split(",").map((value) => value.trim()).filter(Boolean);
const intervalMs = getNumberEnv("SCHEDULER_INTERVAL_MS", 60_000);

let timer: NodeJS.Timeout | undefined;
let lastRun = { at: "", ok: true, summary: "not started" };

async function runCycle(): Promise<void> {
  const cycleStart = Date.now();
  try {
    for (const siteId of sites) {
      const response = await requestWithRetry(
        `${reportingUrl}/api/v1/sites/${siteId}/reports/anomalies?window=15m`,
        { method: "GET" },
        {
          timeoutMs: runtime.apiTimeoutMs,
          retries: runtime.apiRetries,
          backoffMs: runtime.apiBackoffMs
        }
      );

      const payload = await response.json() as { count: number };
      if (payload.count >= 10) {
        await requestWithRetry(`${gatewayUrl}/internal/notify`, {
          method: "POST",
          body: JSON.stringify({
            siteId,
            severity: "critical",
            title: "Scheduler anomaly alert",
            message: `15m anomalies reached ${payload.count}`,
            sourceService: runtime.serviceName
          })
        }, {
          timeoutMs: runtime.apiTimeoutMs,
          retries: runtime.apiRetries,
          backoffMs: runtime.apiBackoffMs
        });

        metrics.notificationSentTotal.labels(runtime.serviceName, siteId).inc();
      }
    }

    lastRun = {
      at: new Date().toISOString(),
      ok: true,
      summary: `cycle completed in ${Date.now() - cycleStart}ms`
    };
  } catch (error) {
    lastRun = {
      at: new Date().toISOString(),
      ok: false,
      summary: error instanceof Error ? error.message : String(error)
    };
    metrics.notificationFailedTotal.labels(runtime.serviceName, "scheduler").inc();
    logger.error("scheduler cycle failed", { error: lastRun.summary });
  }
}

app.addHook("onRequest", async (request) => {
  (request as { startedAt?: number }).startedAt = Date.now();
});

app.addHook("onResponse", async (request, reply) => {
  const start = (request as { startedAt?: number }).startedAt ?? Date.now();
  metrics.apiLatencyMs.labels(runtime.serviceName, request.url, request.method, String(reply.statusCode)).observe(Date.now() - start);
});

app.get("/healthz", async () => {
  return {
    status: lastRun.ok ? "ok" : "degraded",
    service: runtime.serviceName,
    lastRun
  };
});

app.get("/metrics", async (_, reply) => {
  reply.header("content-type", metrics.registry.contentType);
  return metrics.registry.metrics();
});

app.post("/internal/run-cycle", async () => {
  await runCycle();
  return { status: "ok", lastRun };
});

async function start(): Promise<void> {
  timer = setInterval(() => {
    void runCycle();
  }, intervalMs);

  await app.listen({ host: "0.0.0.0", port: runtime.port });
  logger.info("service started", { port: runtime.port, intervalMs, sites });
  void runCycle();
}

async function shutdown(signal: string): Promise<void> {
  logger.warn("shutdown signal", { signal });
  if (timer) {
    clearInterval(timer);
  }
  await app.close();
  process.exit(0);
}

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

start().catch((error) => {
  logger.error("service start failed", { error: String(error) });
  process.exit(1);
});
