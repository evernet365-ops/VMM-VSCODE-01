import Fastify from "fastify";
import {
  CircuitBreaker,
  createLogger,
  createServiceMetrics,
  getEnv,
  getNumberEnv,
  loadServiceRuntimeConfig,
  requestWithRetry,
  type AiEvent
} from "@evernet/shared";

const runtime = loadServiceRuntimeConfig("ai-worker", Number(process.env.AI_WORKER_PORT ?? 3012));
const logger = createLogger(runtime.serviceName);
const metrics = createServiceMetrics(runtime.serviceName);
const app = Fastify({ logger: false });

const orchestratorUrl = getEnv("AI_ORCHESTRATOR_URL", "http://localhost:3011");
const siteId = getEnv("WORKER_SITE_ID", "site-a");
const workerIntervalMs = getNumberEnv("WORKER_INTERVAL_MS", 30_000);
const breaker = new CircuitBreaker(5, 5000, 30_000);

let intervalRef: NodeJS.Timeout | undefined;
let lastDispatch: { ok: boolean; at: string; message: string } = {
  ok: true,
  at: new Date().toISOString(),
  message: "worker initialized"
};

function randomSeverity(): "normal" | "suspect" | "critical" {
  const seed = Math.random();
  if (seed > 0.95) {
    return "critical";
  }
  if (seed > 0.75) {
    return "suspect";
  }
  return "normal";
}

async function dispatchEvent(): Promise<void> {
  if (!runtime.enableAI) {
    lastDispatch = {
      ok: true,
      at: new Date().toISOString(),
      message: "ENABLE_AI=false, skipped"
    };
    return;
  }

  if (!breaker.canRequest()) {
    lastDispatch = {
      ok: false,
      at: new Date().toISOString(),
      message: "circuit breaker open"
    };
    return;
  }

  const startedAt = Date.now();

  const event: AiEvent = {
    siteId,
    cameraId: `cam-${Math.floor(Math.random() * 8) + 1}`,
    eventType: Math.random() > 0.5 ? "offline" : "missing_recording",
    severity: randomSeverity(),
    score: Number(Math.random().toFixed(4)),
    tsEvent: new Date().toISOString(),
    dedupKey: `worker-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    metadata: {
      producer: runtime.serviceName
    }
  };

  try {
    await requestWithRetry(`${orchestratorUrl}/internal/events`, {
      method: "POST",
      body: JSON.stringify(event)
    }, {
      timeoutMs: runtime.apiTimeoutMs,
      retries: runtime.apiRetries,
      backoffMs: runtime.apiBackoffMs
    });

    const latency = Date.now() - startedAt;
    breaker.recordSuccess(latency);
    metrics.aiEventsTotal.labels(runtime.serviceName, siteId).inc();
    lastDispatch = { ok: true, at: new Date().toISOString(), message: "event dispatched" };
  } catch (error) {
    const latency = Date.now() - startedAt;
    breaker.recordFailure(latency);
    lastDispatch = {
      ok: false,
      at: new Date().toISOString(),
      message: error instanceof Error ? error.message : String(error)
    };
    logger.error("worker dispatch failed", { error: lastDispatch.message });
  }
}

app.addHook("onRequest", async (request) => {
  (request as { startedAt?: number }).startedAt = Date.now();
});

app.addHook("onResponse", async (request, reply) => {
  const start = (request as { startedAt?: number }).startedAt ?? Date.now();
  metrics.apiLatencyMs
    .labels(runtime.serviceName, request.url, request.method, String(reply.statusCode))
    .observe(Date.now() - start);
});

app.get("/healthz", async () => {
  return {
    status: lastDispatch.ok ? "ok" : "degraded",
    service: runtime.serviceName,
    lastDispatch,
    circuitBreaker: breaker.snapshot()
  };
});

app.get("/metrics", async (_, reply) => {
  reply.header("content-type", metrics.registry.contentType);
  return metrics.registry.metrics();
});

app.post("/internal/run-once", async () => {
  await dispatchEvent();
  return { status: "ok", lastDispatch };
});

async function start(): Promise<void> {
  intervalRef = setInterval(() => {
    void dispatchEvent();
  }, workerIntervalMs);

  await app.listen({ host: "0.0.0.0", port: runtime.port });
  logger.info("service started", { port: runtime.port, workerIntervalMs });
}

async function shutdown(signal: string): Promise<void> {
  logger.warn("shutdown signal", { signal });
  if (intervalRef) {
    clearInterval(intervalRef);
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
