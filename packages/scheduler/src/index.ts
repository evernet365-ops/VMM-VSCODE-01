import Fastify from "fastify";
import {
  buildInternalAuthHeaders,
  enforceInternalAuth,
  evaluateRollout,
  createLogger,
  createServiceMetrics,
  getEnv,
  getNumberEnv,
  loadServiceRuntimeConfig,
  normalizeBucketCount,
  parseSiteWeights,
  resolveRolloutScope,
  requestWithRetry
} from "@evernet/shared";
import { selectSiteForBucket } from "@evernet/shared";
import { NtpSyncController, clampSyncIntervalMin } from "./ntp-sync.js";

const runtime = loadServiceRuntimeConfig("scheduler", Number(process.env.SCHEDULER_PORT ?? 3015));
const logger = createLogger(runtime.serviceName);
const metrics = createServiceMetrics(runtime.serviceName);
const app = Fastify({ logger: false });

const gatewayUrl = getEnv("NOTIFICATION_GATEWAY_URL", "http://localhost:3010");
const reportingUrl = getEnv("REPORTING_ENGINE_URL", "http://localhost:3014");
const sites = (process.env.SCHEDULER_SITES ?? "site-a,site-b").split(",").map((value) => value.trim()).filter(Boolean);
const intervalMs = getNumberEnv("SCHEDULER_INTERVAL_MS", 60_000);
const siteId = process.env.CONNECTOR_SITE_ID ?? "site-a";

let timer: NodeJS.Timeout | undefined;
let lastRun = { at: "", ok: true, summary: "not started" };
const ntpSync = new NtpSyncController({
  serviceName: runtime.serviceName,
  logger,
  metrics,
  config: {
    enabled: runtime.enableNtpTimeSync ?? false,
    siteId,
    upstreamHost: runtime.ntpUpstreamHost ?? "time.google.com",
    upstreamPort: runtime.ntpUpstreamPort ?? 123,
    syncIntervalMin: clampSyncIntervalMin(runtime.ntpSyncIntervalMin ?? 60),
    requestTimeoutMs: runtime.ntpRequestTimeoutMs ?? 1500,
    serverEnabled: runtime.ntpServerEnabled ?? false,
    serverHost: runtime.ntpServerHost ?? "0.0.0.0",
    serverPort: runtime.ntpServerPort ?? 123,
    manualTimeIso: runtime.ntpManualTimeIso
  }
});

async function runCycle(): Promise<void> {
  const cycleStart = Date.now();
  try {
    let cycleSites = sites;
    const shardScope = resolveRolloutScope(runtime.rolloutScope);
    const shardRollout = evaluateRollout(
      "site-sharding",
      {
        enabled: runtime.enableRolloutGradient ?? false,
        percent: runtime.rolloutPercent ?? 5,
        scope: shardScope
      },
      { siteId, tenantId: siteId }
    );
    metrics.rolloutExposureTotal
      .labels(runtime.serviceName, "site-sharding", shardScope, shardRollout.sampled ? "selected" : "skipped")
      .inc();

    if (runtime.enableSiteSharding && shardRollout.sampled) {
      const bucketCount = normalizeBucketCount(runtime.siteShardBuckets ?? 60, 60);
      const bucketIndex = Math.floor(Date.now() / 1000) % bucketCount;
      const normalized = parseSiteWeights(runtime.siteShardWeights, sites)
        .filter((item) => sites.includes(item.siteId));
      const activeSiteId = selectSiteForBucket(bucketIndex, normalized);
      metrics.pollShardBucketTotal.labels(runtime.serviceName, activeSiteId ?? "none", String(bucketIndex)).inc();
      if (activeSiteId && sites.includes(activeSiteId)) {
        cycleSites = [activeSiteId];
      }
      logger.info("scheduler shard cycle", {
        tenant_id: siteId,
        bucketIndex,
        bucketCount,
        activeSiteId,
        cycleSites
      });
    }

    for (const siteId of cycleSites) {
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
        const notifyBody = JSON.stringify({
          siteId,
          severity: "critical",
          title: "Scheduler anomaly alert",
          message: `15m anomalies reached ${payload.count}`,
          sourceService: runtime.serviceName
        });
        const authHeaders = buildInternalAuthHeaders({
          method: "POST",
          path: "/internal/notify",
          body: notifyBody,
          signingKey: runtime.enableInternalAuthz ? runtime.internalSigningKey : undefined
        });
        await requestWithRetry(`${gatewayUrl}/internal/notify`, {
          method: "POST",
          body: notifyBody,
          headers: {
            "content-type": "application/json",
            ...authHeaders
          }
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

app.addHook("onRequest", async (request, reply) => {
  (request as { startedAt?: number }).startedAt = Date.now();
  const ok = await enforceInternalAuth(
    request,
    reply,
    logger,
    metrics,
    {
      enabled: runtime.enableInternalAuthz ?? false,
      signingKey: runtime.internalSigningKey,
      rateLimitPerMin: runtime.internalRateLimitPerMin ?? 300,
      serviceName: runtime.serviceName,
      scopeTag: "internal",
      shouldProtect: (req) => req.url.startsWith("/internal/")
    },
    {
      tenantId: siteId,
      traceId: String(request.headers["x-trace-id"] ?? "")
    }
  );
  if (!ok) {
    return reply;
  }
});

app.addHook("onResponse", async (request, reply) => {
  const start = (request as { startedAt?: number }).startedAt ?? Date.now();
  metrics.apiLatencyMs.labels(runtime.serviceName, request.url, request.method, String(reply.statusCode)).observe(Date.now() - start);
});

app.get("/healthz", async () => {
  return {
    status: lastRun.ok ? "ok" : "degraded",
    service: runtime.serviceName,
    lastRun,
    ntp: ntpSync.getStatus()
  };
});

app.get("/metrics", async (_, reply) => {
  reply.header("content-type", metrics.registry.contentType);
  return metrics.registry.metrics();
});

app.get("/api/v1/time-sync/status", async () => {
  return {
    status: "ok",
    service: runtime.serviceName,
    now: ntpSync.getCurrentTimeIso(),
    ntp: ntpSync.getStatus()
  };
});

app.post("/api/v1/time-sync/manual", async (request, reply) => {
  const body = (request.body ?? {}) as { isoTime?: string | null };
  const isoTime = body.isoTime ?? undefined;

  const result = ntpSync.setManualTime(isoTime ?? undefined);
  if (!result.accepted) {
    reply.status(400);
    return {
      status: "invalid",
      reason: result.reason ?? "unknown"
    };
  }

  logger.info("ntp manual time updated", {
    tenant_id: siteId,
    mode: isoTime ? "manual" : "upstream"
  });

  return {
    status: "ok",
    now: ntpSync.getCurrentTimeIso(),
    ntp: ntpSync.getStatus()
  };
});

app.get("/api/v1/sites/:siteId/time-sync/status", async () => {
  return {
    status: "ok",
    service: runtime.serviceName,
    now: ntpSync.getCurrentTimeIso(),
    ntp: ntpSync.getStatus()
  };
});

app.post("/api/v1/sites/:siteId/time-sync/manual", async (request, reply) => {
  const params = request.params as { siteId?: string };
  const requestSiteId = params.siteId ?? siteId;
  const body = (request.body ?? {}) as { isoTime?: string | null };
  const isoTime = body.isoTime ?? undefined;

  const result = ntpSync.setManualTime(isoTime ?? undefined);
  if (!result.accepted) {
    reply.status(400);
    return {
      status: "invalid",
      reason: result.reason ?? "unknown"
    };
  }

  logger.info("ntp manual time updated", {
    tenant_id: requestSiteId,
    mode: isoTime ? "manual" : "upstream"
  });

  return {
    status: "ok",
    now: ntpSync.getCurrentTimeIso(),
    ntp: ntpSync.getStatus()
  };
});

app.post("/internal/run-cycle", async () => {
  await runCycle();
  return { status: "ok", lastRun };
});

async function start(): Promise<void> {
  ntpSync.start();

  timer = setInterval(() => {
    void runCycle();
  }, intervalMs);

  await app.listen({ host: "0.0.0.0", port: runtime.port });
  logger.info("service started", {
    port: runtime.port,
    intervalMs,
    sites,
    tenant_id: siteId,
    feature_ntp_time_sync: runtime.enableNtpTimeSync ?? false
  });
  void runCycle();
}

async function shutdown(signal: string): Promise<void> {
  logger.warn("shutdown signal", { signal });
  if (timer) {
    clearInterval(timer);
  }
  ntpSync.stop();
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
