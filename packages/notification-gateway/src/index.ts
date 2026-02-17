import fs from "node:fs";
import path from "node:path";
import Fastify from "fastify";
import {
  closeDbPool,
  createLogger,
  createServiceMetrics,
  getDbPool,
  getEnv,
  loadServiceRuntimeConfig,
  requestWithRetry,
  type NotifyCard,
  type NotifyRequest,
  type Severity
} from "@evernet/shared";

interface SiteGatewayConfig {
  enabled: boolean;
  channels: string[];
  rateLimitPerSitePerMin: number;
  gchat: {
    mode: "text" | "cards";
    buttonsPerCard: number;
  };
  routes: Record<string, string>;
}

interface GatewayConfig {
  sites: Record<string, SiteGatewayConfig>;
}

interface RateLimitState {
  windowStartMs: number;
  used: number;
}

const runtime = loadServiceRuntimeConfig("notification-gateway", Number(process.env.NOTIFICATION_GATEWAY_PORT ?? 3010));
const logger = createLogger(runtime.serviceName);
const metrics = createServiceMetrics(runtime.serviceName);
const db = getDbPool();

const gatewayConfigPath = getEnv("GATEWAY_CONFIG_PATH", path.resolve("config/gateway/gateway.json.example"));
const gatewayConfig = JSON.parse(fs.readFileSync(gatewayConfigPath, "utf8")) as GatewayConfig;
const rateLimits = new Map<string, RateLimitState>();

const app = Fastify({ logger: false });

app.addHook("onResponse", async (request, reply) => {
  const startAt = (request as { receivedAtMs?: number }).receivedAtMs ?? Date.now();
  const latency = Date.now() - startAt;
  metrics.apiLatencyMs
    .labels(runtime.serviceName, request.url, request.method, String(reply.statusCode))
    .observe(latency);
  metrics.dbConnections.labels(runtime.serviceName).set((db as unknown as { totalCount?: number }).totalCount ?? 0);
});

app.addHook("onRequest", async (request) => {
  (request as { receivedAtMs?: number }).receivedAtMs = Date.now();
});

app.get("/healthz", async () => {
  try {
    await db.query("select 1");
    return { status: "ok", service: runtime.serviceName };
  } catch (error) {
    logger.error("healthz failed", { error: String(error) });
    return { status: "degraded", service: runtime.serviceName };
  }
});

app.get("/metrics", async (_, reply) => {
  reply.header("content-type", metrics.registry.contentType);
  return metrics.registry.metrics();
});

function chunkLinks(card: NotifyCard, size: number): NotifyCard[] {
  if (!card.links || card.links.length <= size) {
    return [card];
  }

  const chunks: NotifyCard[] = [];
  for (let index = 0; index < card.links.length; index += size) {
    chunks.push({
      ...card,
      links: card.links.slice(index, index + size)
    });
  }
  return chunks;
}

function checkRateLimit(siteId: string, perMin: number): boolean {
  const now = Date.now();
  const current = rateLimits.get(siteId);
  if (!current || now - current.windowStartMs >= 60_000) {
    rateLimits.set(siteId, { windowStartMs: now, used: 1 });
    return true;
  }

  if (current.used >= perMin) {
    return false;
  }

  current.used += 1;
  return true;
}

async function writeNotificationLog(args: {
  siteId: string;
  channel: string;
  severity: Severity;
  status: "sent" | "failed" | "skipped";
  target: string;
  payload: Record<string, unknown>;
  errorMessage?: string;
}): Promise<void> {
  try {
    await db.query(
      `insert into notification_log
      (site_id, channel, severity, status, target, payload, error_message)
      values ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
      [
        args.siteId,
        args.channel,
        args.severity,
        args.status,
        args.target,
        JSON.stringify(args.payload),
        args.errorMessage ?? null
      ]
    );
  } catch (error) {
    logger.error("notification_log insert failed", { error: String(error), siteId: args.siteId });
  }
}

async function sendToRoute(route: string, payload: Record<string, unknown>): Promise<void> {
  if (route.startsWith("mock://")) {
    logger.info("mock route send", { route, payload });
    return;
  }

  await requestWithRetry(route, {
    method: "POST",
    body: JSON.stringify(payload)
  }, {
    timeoutMs: runtime.apiTimeoutMs,
    retries: runtime.apiRetries,
    backoffMs: runtime.apiBackoffMs
  });
}

app.post("/internal/notify", async (request, reply) => {
  const body = request.body as NotifyRequest;

  if (!body || !body.siteId || !body.title || !body.message || !body.severity) {
    reply.status(400);
    return { error: "siteId, title, message, severity are required" };
  }

  const siteConfig = gatewayConfig.sites[body.siteId];
  if (!siteConfig || !siteConfig.enabled) {
    reply.status(403);
    return { error: "site disabled or not configured" };
  }

  if (body.severity !== "critical" && !runtime.notifyNonCritical) {
    await writeNotificationLog({
      siteId: body.siteId,
      channel: "none",
      severity: body.severity,
      status: "skipped",
      target: "policy",
      payload: { reason: "NOTIFY_NON_CRITICAL=false", title: body.title }
    });
    return { status: "skipped", reason: "non-critical notification disabled" };
  }

  if (!checkRateLimit(body.siteId, siteConfig.rateLimitPerSitePerMin)) {
    reply.status(429);
    return { error: "site notification rate limit exceeded" };
  }

  const channels = body.channels && body.channels.length > 0 ? body.channels : siteConfig.channels;
  const payloads = body.card && siteConfig.gchat.mode === "cards"
    ? chunkLinks(body.card, siteConfig.gchat.buttonsPerCard).map((card) => ({
        mode: "cards",
        siteId: body.siteId,
        severity: body.severity,
        title: body.title,
        message: body.message,
        card
      }))
    : [{
        mode: "text",
        siteId: body.siteId,
        severity: body.severity,
        title: body.title,
        message: body.message
      }];

  const results: Array<{ channel: string; status: "sent" | "failed"; error?: string }> = [];

  for (const channel of channels) {
    const route = siteConfig.routes[channel];
    if (!route) {
      results.push({ channel, status: "failed", error: "missing route" });
      metrics.notificationFailedTotal.labels(runtime.serviceName, body.siteId).inc();
      await writeNotificationLog({
        siteId: body.siteId,
        channel,
        severity: body.severity,
        status: "failed",
        target: "missing-route",
        payload: { channel, payloads },
        errorMessage: "missing route"
      });
      continue;
    }

    try {
      await Promise.all(payloads.map((payload) => sendToRoute(route, payload)));
      results.push({ channel, status: "sent" });
      metrics.notificationSentTotal.labels(runtime.serviceName, body.siteId).inc();
      await writeNotificationLog({
        siteId: body.siteId,
        channel,
        severity: body.severity,
        status: "sent",
        target: route,
        payload: { channel, payloads }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({ channel, status: "failed", error: message });
      metrics.notificationFailedTotal.labels(runtime.serviceName, body.siteId).inc();
      await writeNotificationLog({
        siteId: body.siteId,
        channel,
        severity: body.severity,
        status: "failed",
        target: route,
        payload: { channel, payloads },
        errorMessage: message
      });
    }
  }

  return {
    siteId: body.siteId,
    resultCount: results.length,
    results
  };
});

async function start(): Promise<void> {
  await app.listen({ port: runtime.port, host: "0.0.0.0" });
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
