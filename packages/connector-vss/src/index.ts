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
  mapHealthToSeverity,
  requestWithRetry,
  type Severity
} from "@evernet/shared";
import {
  evaluateHealth,
  type CameraHealthState,
  type HealthSample
} from "./health-monitor.js";
import {
  buildPollShardingPlan,
  normalizeShardingConfig
} from "./poll-sharding.js";
import { probeGenericCgi } from "./providers/generic-cgi.js";
import { probeOnvif } from "./providers/onvif.js";
import { probeRtsp } from "./providers/rtsp.js";
import { probeVivotek } from "./providers/vivotek.js";

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
let currentHealthState: CameraHealthState = "DOWN";
let consecutiveFailures = 0;
let loadShedMode = false;
let nextTimer: NodeJS.Timeout | undefined;
let lastLoadedCameraIds: string[] = [];

type ProviderProbeItem = {
  name: string;
  success: boolean;
  offlineCameras: number;
  detail: string;
};

type GenericVendorProbeConfig = {
  enabled: boolean | undefined;
  providerName: string;
  nvrBaseUrl?: string;
  cameraBaseUrl?: string;
  username?: string;
  password?: string;
  nvrPaths?: string[];
  cameraPaths?: string[];
};

type ProbeExecutionResult = {
  success: boolean;
  latencyMs: number;
  offlineCameras: number;
  detail?: string;
  providerResults?: ProviderProbeItem[];
};

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

async function probeByEnabledProviders(): Promise<ProbeExecutionResult | undefined> {
  const startedAt = Date.now();
  const results: ProviderProbeItem[] = [];

  if (runtime.enableVmsVivotekCgi) {
    const vivotek = await probeVivotek({
      nvrBaseUrl: runtime.vivotekNvrBaseUrl,
      ipcamBaseUrl: runtime.vivotekIpcamBaseUrl,
      username: runtime.vivotekUsername,
      password: runtime.vivotekPassword,
      cameraId: runtime.vivotekCameraId,
      timeoutMs: runtime.apiTimeoutMs,
      retries: runtime.apiRetries,
      backoffMs: runtime.apiBackoffMs
    });
    results.push({ name: "vivotek", success: vivotek.success, offlineCameras: vivotek.offlineCameras, detail: vivotek.detail });
  }

  if (runtime.enableVmsOnvifProbe) {
    const onvif = await probeOnvif({
      deviceServiceUrl: runtime.onvifDeviceServiceUrl,
      mediaServiceUrl: runtime.onvifMediaServiceUrl,
      username: runtime.onvifUsername,
      password: runtime.onvifPassword,
      timeoutMs: runtime.apiTimeoutMs,
      retries: runtime.apiRetries,
      backoffMs: runtime.apiBackoffMs
    });
    results.push({ name: "onvif", success: onvif.success, offlineCameras: onvif.offlineCameras, detail: onvif.detail });
  }

  if (runtime.enableVmsRtspProbe) {
    const rtsp = await probeRtsp({
      rtspUrl: runtime.rtspUrl,
      username: runtime.rtspUsername,
      password: runtime.rtspPassword,
      timeoutMs: runtime.apiTimeoutMs
    });
    results.push({ name: "rtsp", success: rtsp.success, offlineCameras: rtsp.offlineCameras, detail: rtsp.detail });
  }

  const genericVendorConfigs: GenericVendorProbeConfig[] = [
    {
      enabled: runtime.enableVmsActiCgi,
      providerName: "acti",
      nvrBaseUrl: runtime.actiNvrBaseUrl,
      cameraBaseUrl: runtime.actiCameraBaseUrl,
      username: runtime.actiUsername,
      password: runtime.actiPassword
    },
    {
      enabled: runtime.enableVmsAvtechCgi,
      providerName: "avtech",
      nvrBaseUrl: runtime.avtechNvrBaseUrl,
      cameraBaseUrl: runtime.avtechCameraBaseUrl,
      username: runtime.avtechUsername,
      password: runtime.avtechPassword
    },
    {
      enabled: runtime.enableVmsLilinCgi,
      providerName: "lilin",
      nvrBaseUrl: runtime.lilinNvrBaseUrl,
      cameraBaseUrl: runtime.lilinCameraBaseUrl,
      username: runtime.lilinUsername,
      password: runtime.lilinPassword
    },
    {
      enabled: runtime.enableVmsGeovisionCgi,
      providerName: "geovision",
      nvrBaseUrl: runtime.geovisionNvrBaseUrl,
      cameraBaseUrl: runtime.geovisionCameraBaseUrl,
      username: runtime.geovisionUsername,
      password: runtime.geovisionPassword
    },
    {
      enabled: runtime.enableVmsHisharpCgi,
      providerName: "hisharp",
      nvrBaseUrl: runtime.hisharpNvrBaseUrl,
      cameraBaseUrl: runtime.hisharpCameraBaseUrl,
      username: runtime.hisharpUsername,
      password: runtime.hisharpPassword
    },
    {
      enabled: runtime.enableVmsUniviewCgi,
      providerName: "uniview",
      nvrBaseUrl: runtime.univiewNvrBaseUrl,
      cameraBaseUrl: runtime.univiewCameraBaseUrl,
      username: runtime.univiewUsername,
      password: runtime.univiewPassword
    },
    {
      enabled: runtime.enableVmsHikvisionCgi,
      providerName: "hikvision",
      nvrBaseUrl: runtime.hikvisionNvrBaseUrl,
      cameraBaseUrl: runtime.hikvisionCameraBaseUrl,
      username: runtime.hikvisionUsername,
      password: runtime.hikvisionPassword
    },
    {
      enabled: runtime.enableVmsXmCgi,
      providerName: "xm",
      nvrBaseUrl: runtime.xmNvrBaseUrl,
      cameraBaseUrl: runtime.xmCameraBaseUrl,
      username: runtime.xmUsername,
      password: runtime.xmPassword
    },
    {
      enabled: runtime.enableVmsSampoCgi,
      providerName: "sampo",
      nvrBaseUrl: runtime.sampoNvrBaseUrl,
      cameraBaseUrl: runtime.sampoCameraBaseUrl,
      username: runtime.sampoUsername,
      password: runtime.sampoPassword,
      nvrPaths: ["/cgi-bin/magicBox.cgi?action=getSystemInfo", "/cgi-bin/eventManager.cgi?action=getEventIndexes", "/api/serverInfo"],
      cameraPaths: ["/cgi-bin/magicBox.cgi?action=getSystemInfo", "/cgi-bin/viewer/video.jpg", "/api/serverInfo"]
    }
  ];

  for (const vendor of genericVendorConfigs) {
    if (!vendor.enabled) {
      continue;
    }

    const generic = await probeGenericCgi({
      providerName: vendor.providerName,
      nvrBaseUrl: vendor.nvrBaseUrl,
      cameraBaseUrl: vendor.cameraBaseUrl,
      username: vendor.username,
      password: vendor.password,
      nvrPaths: vendor.nvrPaths ?? ["/api/serverInfo", "/ISAPI/System/status", "/cgi-bin/system"],
      cameraPaths: vendor.cameraPaths ?? ["/cgi-bin/viewer/video.jpg", "/ISAPI/System/status", "/cgi-bin/system"],
      timeoutMs: runtime.apiTimeoutMs,
      retries: runtime.apiRetries,
      backoffMs: runtime.apiBackoffMs
    });
    results.push({
      name: vendor.providerName,
      success: generic.success,
      offlineCameras: generic.offlineCameras,
      detail: generic.detail
    });
  }

  if (results.length === 0) {
    return undefined;
  }

  const success = results.every((result) => result.success);
  const offlineCameras = results.reduce((sum, result) => sum + result.offlineCameras, 0);
  const detail = results.map((result) => `${result.name}:${result.detail}`).join("; ");
  return {
    success,
    latencyMs: Date.now() - startedAt,
    offlineCameras,
    detail,
    providerResults: results
  };
}

async function loadCameraIds(): Promise<string[]> {
  try {
    const result = await db.query(
      `select id
       from camera
       where site_id = $1
       order by id asc`,
      [siteId]
    );
    const ids = result.rows.map((row) => String((row as { id: string }).id)).filter((id) => id.length > 0);
    if (ids.length > 0) {
      lastLoadedCameraIds = ids;
      return ids;
    }
    return lastLoadedCameraIds;
  } catch (error) {
    logger.warn("camera id load failed, fallback to cached list", { error: String(error) });
    return lastLoadedCameraIds;
  }
}

async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number,
  minGapMs: number
): Promise<T[]> {
  const results: T[] = [];
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= tasks.length) {
        return;
      }
      const task = tasks[index];
      const result = await task();
      results.push(result);
      if (minGapMs > 0) {
        await sleep(minGapMs);
      }
    }
  }

  const count = Math.max(1, Math.min(concurrency, tasks.length));
  await Promise.all(Array.from({ length: count }, () => worker()));
  return results;
}

async function probeWithSharding(nowMs: number): Promise<ProbeExecutionResult> {
  const providerProbe = await probeByEnabledProviders();
  if (providerProbe) {
    return providerProbe;
  }

  const cameraIds = await loadCameraIds();
  if (cameraIds.length === 0) {
    return probeWithRetry();
  }

  const sharding = normalizeShardingConfig({
    bucketCount: runtime.pollBucketCount,
    maxConcurrency: runtime.pollMaxConcurrency,
    siteConcurrency: runtime.pollSiteConcurrency,
    rateLimitPerSec: runtime.pollRateLimitPerSec,
    staggerEnabled: runtime.pollStaggerEnabled
  });
  const plan = buildPollShardingPlan(cameraIds, nowMs, sharding);
  const targets = plan.selectedCameraIds.length > 0 ? plan.selectedCameraIds : cameraIds;

  const tasks = targets.map(() => () => simulateVssProbe());
  const startedAt = Date.now();
  const results = await runWithConcurrency(tasks, plan.effectiveConcurrency, sharding.staggerEnabled ? plan.minLaunchGapMs : 0);
  const failed = results.filter((item) => !item.success).length;
  const offlineCameras = results.reduce((sum, item) => sum + (item.success ? item.offlineCameras : 1), 0);
  const success = failed === 0 || failed < Math.max(1, Math.floor(results.length * 0.2));
  const latencyMs = Date.now() - startedAt;

  logger.info("poll sharding batch completed", {
    bucketIndex: plan.bucketIndex,
    totalCamera: cameraIds.length,
    selectedCamera: targets.length,
    failed,
    concurrency: plan.effectiveConcurrency
  });

  return { success, latencyMs, offlineCameras };
}

async function probeWithRetry(): Promise<ProbeExecutionResult> {
  const providerProbe = await probeByEnabledProviders();
  if (providerProbe) {
    return providerProbe;
  }

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

  const result = runtime.enableVmsPollingSharding ? await probeWithSharding(start) : await probeWithRetry();
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

  if (result.providerResults && result.providerResults.length > 0) {
    for (const providerResult of result.providerResults) {
      metrics.providerProbeTotal
        .labels(runtime.serviceName, siteId, providerResult.name, providerResult.success ? "success" : "failure")
        .inc();
    }

    logger.info("provider probe batch completed", {
      site_id: siteId,
      providers: result.providerResults.map((item) => ({
        provider: item.name,
        success: item.success,
        offlineCameras: item.offlineCameras
      }))
    });
  }

  if (runtime.enableVmsHealthMonitor) {
    const healthSample: HealthSample = {
      reconnects: result.success ? Math.floor(Math.random() * 2) : 1,
      fps: result.success ? Math.floor(15 + Math.random() * 10) : 0,
      dropFrames: result.success ? Math.floor(Math.random() * 6) : 12,
      lastFrameTsMs: result.success ? Date.now() - Math.floor(Math.random() * 2_000) : Date.now() - 60_000,
      nowMs: Date.now(),
      staleTimeoutMs: runtime.apiTimeoutMs * 2,
      offline: !result.success
    };

    const health = evaluateHealth(currentHealthState, healthSample);
    const labels = [runtime.serviceName, siteId] as const;

    metrics.cameraReconnects.labels(...labels).set(healthSample.reconnects ?? 0);
    metrics.cameraFps.labels(...labels).set(healthSample.fps ?? 0);
    metrics.cameraDropFrames.labels(...labels).set(healthSample.dropFrames ?? 0);
    metrics.cameraLastFrameTs.labels(...labels).set(healthSample.lastFrameTsMs ?? 0);

    if (health.changed) {
      currentHealthState = health.state;
      const severityFromHealth = mapHealthToSeverity(health.state);
      queue.push({ ts: new Date().toISOString(), severity: severityFromHealth, detail: `health ${health.state} (${health.reason})` });
      while (queue.length > maxQueue) {
        queue.shift();
      }
      logger.info("camera health state changed", { state: health.state, reason: health.reason });
    }
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
    pollingSharding: {
      enabled: runtime.enableVmsPollingSharding ?? false,
      bucketCount: runtime.pollBucketCount,
      maxConcurrency: runtime.pollMaxConcurrency,
      siteConcurrency: runtime.pollSiteConcurrency,
      rateLimitPerSec: runtime.pollRateLimitPerSec,
      staggerEnabled: runtime.pollStaggerEnabled
    },
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
