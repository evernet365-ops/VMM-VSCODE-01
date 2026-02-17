import Fastify from "fastify";
import {
  CircuitBreaker,
  addJitter,
  calculatePollDelayMs,
  closeDbPool,
  createLogger,
  createServiceMetrics,
  getDbPool,
  getEnv,
  getNumberEnv,
  loadServiceRuntimeConfig,
  requestWithRetry,
  type Severity
} from "@evernet/shared";

const runtime = loadServiceRuntimeConfig("connector-vss", Number(process.env.CONNECTOR_VSS_PORT ?? 3013));
const logger = createLogger(runtime.serviceName);
const metrics = createServiceMetrics(runtime.serviceName);
const db = getDbPool();
const app = Fastify({ logger: false });

const siteId = getEnv("CONNECTOR_SITE_ID", "site-a");
const gatewayUrl = getEnv("NOTIFICATION_GATEWAY_URL", "http://localhost:3010");
const breaker = new CircuitBreaker(5, 5000, 30_000);
const queue: Array<{ ts: string; severity: Severity; detail: string }> = [];
const maxQueue = getNumberEnv("EVENT_QUEUE_MAX", runtime.eventQueueMax);

let currentSeverity: Severity = "normal";
let consecutiveFailures = 0;
let loadShedMode = false;
let nextTimer: NodeJS.Timeout | undefined;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function simulateVssProbe(): Promise<{ success: boolean; latencyMs: number; offlineCameras: number }> {
  const latencyMs = Math.floor(100 + Math.random() * 6500);
  await sleep(latencyMs);
  const success = Math.random() > 0.18;
  const offlineCameras = Math.floor(Math.random() * 20);
  return { success, latencyMs, offlineCameras };
}

async function probeWithRetry(): Promise<{ success: boolean; latencyMs: number; offlineCameras: number }> {
  let lastFailure: { latencyMs: number; offlineCameras: number } = { latencyMs: 0, offlineCameras: 0 };

  for (let attempt = 0; attempt <= runtime.apiRetries; attempt += 1) {
    const result = await simulateVssProbe();
    if (result.success) {
      return result;
    }

    lastFailure = { latencyMs: result.latencyMs, offlineCameras: result.offlineCameras };
    if (attempt < runtime.apiRetries) {
      const backoff = runtime.apiBackoffMs * Math.pow(2, attempt);
      await sleep(backoff);
    }
  }

  return { success: false, latencyMs: lastFailure.latencyMs, offlineCameras: lastFailure.offlineCameras };
}

async function writePollState(latencyMs: number): Promise<void> {
  try {
    await db.query(
      `insert into poll_state
      (site_id, component, severity, next_poll_at, last_latency_ms, consecutive_failures, load_shed_mode, updated_at)
      values ($1, $2, $3, now() + ($4 || ' milliseconds')::interval, $5, $6, $7, now())
      on conflict (site_id, component) do update
      set severity = excluded.severity,
          next_poll_at = excluded.next_poll_at,
          last_latency_ms = excluded.last_latency_ms,
          consecutive_failures = excluded.consecutive_failures,
          load_shed_mode = excluded.load_shed_mode,
          updated_at = excluded.updated_at`,
      [siteId, runtime.serviceName, currentSeverity, calculatePollDelayMs(currentSeverity, runtime.pollIntervalSec, runtime.pollJitterSec), latencyMs, consecutiveFailures, loadShedMode]
    );

    const snapshot = breaker.snapshot();
    await db.query(
      `insert into circuit_breaker_state
      (site_id, target_service, state, failure_count, last_failure_at, last_latency_ms, opened_at, updated_at)
      values ($1, $2, $3, $4, $5, $6, $7, now())
      on conflict (site_id, target_service) do update
      set state = excluded.state,
          failure_count = excluded.failure_count,
          last_failure_at = excluded.last_failure_at,
          last_latency_ms = excluded.last_latency_ms,
          opened_at = excluded.opened_at,
          updated_at = excluded.updated_at`,
      [siteId, "vss-provider", snapshot.state, snapshot.failureCount, snapshot.lastFailureAt ?? null, snapshot.lastLatencyMs, snapshot.openedAt ?? null]
    );
  } catch (error) {
    logger.error("poll state persistence failed", { error: String(error) });
  }
}

async function notifyCritical(detail: string): Promise<void> {
  try {
    await requestWithRetry(`${gatewayUrl}/internal/notify`, {
      method: "POST",
      body: JSON.stringify({
        siteId,
        severity: "critical",
        title: "Connector critical state",
        message: detail,
        sourceService: runtime.serviceName,
        metadata: {
          loadShedMode,
          consecutiveFailures
        }
      })
    }, {
      timeoutMs: runtime.apiTimeoutMs,
      retries: runtime.apiRetries,
      backoffMs: runtime.apiBackoffMs
    });
  } catch (error) {
    logger.error("critical notification failed", { error: String(error) });
  }
}

async function pollLoop(): Promise<void> {
  const start = Date.now();

  if (!breaker.canRequest()) {
    currentSeverity = "critical";
    consecutiveFailures += 1;
    loadShedMode = true;
    queue.push({ ts: new Date().toISOString(), severity: "critical", detail: "circuit breaker open" });
    if (queue.length > maxQueue) {
      queue.shift();
    }
    await writePollState(runtime.apiTimeoutMs + 1);
    void notifyCritical("Circuit breaker open. Poll loop is in load-shed mode.");
    scheduleNext();
    return;
  }

  const result = await probeWithRetry();
  const latencyMs = Date.now() - start;

  if (result.success) {
    breaker.recordSuccess(latencyMs);
    consecutiveFailures = 0;
    currentSeverity = result.offlineCameras > 0 ? "suspect" : "normal";
  } else {
    breaker.recordFailure(latencyMs);
    consecutiveFailures += 1;
    currentSeverity = consecutiveFailures >= 5 || latencyMs > 5000 ? "critical" : "suspect";
  }

  loadShedMode = currentSeverity === "critical" || queue.length >= maxQueue;

  const detail = result.success
    ? `probe ok, offline cameras: ${result.offlineCameras}`
    : `probe failed, latency ${latencyMs}ms`;

  if (!(loadShedMode && currentSeverity !== "critical")) {
    queue.push({ ts: new Date().toISOString(), severity: currentSeverity, detail });
  }

  while (queue.length > maxQueue) {
    queue.shift();
  }

  if (result.success) {
    metrics.cameraOnlineTotal.labels(runtime.serviceName, siteId).inc();
    metrics.nvrOnlineTotal.labels(runtime.serviceName, siteId).inc();
  } else {
    metrics.cameraOfflineTotal.labels(runtime.serviceName, siteId).inc();
  }

  await writePollState(latencyMs);

  if (currentSeverity === "critical") {
    void notifyCritical(detail);
  }

  scheduleNext();
}

function scheduleNext(): void {
  const delay = calculatePollDelayMs(currentSeverity, runtime.pollIntervalSec, runtime.pollJitterSec);
  const jitteredDelay = currentSeverity === "normal" ? addJitter(delay, runtime.pollJitterSec) : delay;

  if (nextTimer) {
    clearTimeout(nextTimer);
  }

  nextTimer = setTimeout(() => {
    void pollLoop();
  }, jitteredDelay);
}

app.addHook("onRequest", async (request) => {
  (request as { startedAt?: number }).startedAt = Date.now();
});

app.addHook("onResponse", async (request, reply) => {
  const startAt = (request as { startedAt?: number }).startedAt ?? Date.now();
  const latency = Date.now() - startAt;
  metrics.apiLatencyMs.labels(runtime.serviceName, request.url, request.method, String(reply.statusCode)).observe(latency);
  metrics.dbConnections.labels(runtime.serviceName).set((db as unknown as { totalCount?: number }).totalCount ?? 0);
});

app.get("/healthz", async () => {
  return {
    status: breaker.canRequest() ? "ok" : "degraded",
    service: runtime.serviceName,
    siteId,
    severity: currentSeverity,
    consecutiveFailures,
    loadShedMode,
    queueSize: queue.length,
    circuitBreaker: breaker.snapshot()
  };
});

app.get("/metrics", async (_, reply) => {
  reply.header("content-type", metrics.registry.contentType);
  return metrics.registry.metrics();
});

async function start(): Promise<void> {
  await app.listen({ host: "0.0.0.0", port: runtime.port });
  logger.info("service started", { port: runtime.port, siteId });
  void pollLoop();
}

async function shutdown(signal: string): Promise<void> {
  logger.warn("shutdown signal", { signal });
  if (nextTimer) {
    clearTimeout(nextTimer);
  }
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
