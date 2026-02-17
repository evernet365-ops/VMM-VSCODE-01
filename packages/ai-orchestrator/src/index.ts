import Fastify from "fastify";
import {
  buildInternalAuthHeaders,
  closeDbPool,
  createLogger,
  createServiceMetrics,
  enforceInternalAuth,
  getDbPool,
  getEnv,
  loadServiceRuntimeConfig,
  requestWithRetry,
  type AiArtifact,
  type AiEvent,
  type NotifyRequest
} from "@evernet/shared";

const runtime = loadServiceRuntimeConfig("ai-orchestrator", Number(process.env.AI_ORCHESTRATOR_PORT ?? 3011));
const logger = createLogger(runtime.serviceName);
const metrics = createServiceMetrics(runtime.serviceName);
const db = getDbPool();
const gatewayUrl = getEnv("NOTIFICATION_GATEWAY_URL", "http://localhost:3010");

const app = Fastify({ logger: false });

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
      traceId: String(request.headers["x-trace-id"] ?? "")
    }
  );
  if (!ok) {
    return reply;
  }
});

app.addHook("onResponse", async (request, reply) => {
  const startedAt = (request as { startedAt?: number }).startedAt ?? Date.now();
  const latency = Date.now() - startedAt;
  metrics.apiLatencyMs.labels(runtime.serviceName, request.url, request.method, String(reply.statusCode)).observe(latency);
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

async function notifyGateway(event: AiEvent): Promise<void> {
  if (event.severity !== "critical" && !runtime.notifyNonCritical) {
    return;
  }

  const payload: NotifyRequest = {
    siteId: event.siteId,
    severity: event.severity,
    title: `[${event.severity}] ${event.eventType}`,
    message: `Camera ${event.cameraId} reported ${event.eventType} with score ${event.score}`,
    sourceService: runtime.serviceName,
    metadata: {
      eventId: event.id,
      tsEvent: event.tsEvent
    }
  };
  const body = JSON.stringify(payload);
  const authHeaders = buildInternalAuthHeaders({
    method: "POST",
    path: "/internal/notify",
    body,
    signingKey: runtime.enableInternalAuthz ? runtime.internalSigningKey : undefined
  });

  await requestWithRetry(`${gatewayUrl}/internal/notify`, {
    method: "POST",
    body,
    headers: {
      "content-type": "application/json",
      ...authHeaders
    }
  }, {
    timeoutMs: runtime.apiTimeoutMs,
    retries: runtime.apiRetries,
    backoffMs: runtime.apiBackoffMs
  });
}

app.post("/internal/events", async (request, reply) => {
  const body = request.body as AiEvent & { artifacts?: AiArtifact[] };
  if (!body?.siteId || !body.cameraId || !body.eventType || !body.severity || !body.dedupKey) {
    reply.status(400);
    return { error: "siteId, cameraId, eventType, severity, dedupKey are required" };
  }

  const event: AiEvent = {
    ...body,
    tsEvent: body.tsEvent ?? new Date().toISOString(),
    score: Number(body.score ?? 0)
  };

  try {
    const insert = await db.query(
      `insert into ai_event
      (site_id, camera_id, event_type, severity, score, ts_event, dedup_key, metadata_json)
      values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
      on conflict (site_id, dedup_key) do update
      set ts_event = excluded.ts_event,
          score = excluded.score,
          metadata_json = excluded.metadata_json
      returning id`,
      [
        event.siteId,
        event.cameraId,
        event.eventType,
        event.severity,
        event.score,
        event.tsEvent,
        event.dedupKey,
        JSON.stringify(event.metadata ?? {})
      ]
    );

    event.id = insert.rows[0]?.id as string;

    if (Array.isArray(body.artifacts)) {
      for (const artifact of body.artifacts) {
        await db.query(
          `insert into ai_artifact (event_id, type, storage_path, metadata_json)
          values ($1, $2, $3, $4::jsonb)`,
          [event.id, artifact.type, artifact.storagePath, JSON.stringify(artifact.metadataJson ?? {})]
        );
      }
    }

    metrics.aiEventsTotal.labels(runtime.serviceName, event.siteId).inc();

    void notifyGateway(event).catch((error) => {
      logger.error("notification dispatch failed", {
        siteId: event.siteId,
        eventType: event.eventType,
        error: String(error)
      });
    });

    return { status: "accepted", eventId: event.id };
  } catch (error) {
    logger.error("event write failed", { error: String(error) });
    reply.status(503);
    return { error: "database write failed, request retained for retry" };
  }
});

app.get("/api/v1/sites/:siteId/ai-events", async (request) => {
  const params = request.params as { siteId: string };
  const query = request.query as { limit?: string };
  const limit = Math.min(200, Math.max(1, Number(query.limit ?? 100)));

  const result = await db.query(
    `select id, site_id, camera_id, event_type, severity, score, ts_event, dedup_key, metadata_json
     from ai_event
     where site_id = $1
     order by ts_event desc
     limit $2`,
    [params.siteId, limit]
  );

  return {
    siteId: params.siteId,
    count: result.rowCount,
    items: result.rows
  };
});

app.get("/api/v1/sites/:siteId/poll-state", async (request) => {
  const params = request.params as { siteId: string };
  const result = await db.query(
    `select site_id, component, severity, next_poll_at, last_latency_ms, consecutive_failures, load_shed_mode, updated_at
     from poll_state
     where site_id = $1
     order by component asc`,
    [params.siteId]
  );

  return {
    siteId: params.siteId,
    items: result.rows
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
