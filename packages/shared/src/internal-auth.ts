import { createHmac, timingSafeEqual } from "node:crypto";
import type { Logger } from "./logger.js";
import type { ServiceMetrics } from "./metrics.js";

type HttpRequestLike = {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  ip?: string;
};

type HttpReplyLike = {
  status: (code: number) => HttpReplyLike;
  send: (payload: unknown) => void;
};

type RateLimitState = {
  windowStartMs: number;
  used: number;
};

export type InternalAuthGuardConfig = {
  enabled: boolean;
  signingKey?: string;
  rateLimitPerMin: number;
  serviceName: string;
  scopeTag: string;
  shouldProtect: (request: HttpRequestLike) => boolean;
};

export type InternalAuthAuditContext = {
  tenantId?: string;
  traceId?: string;
};

const MAX_SKEW_MS = 5 * 60 * 1000;
const rateLimits = new Map<string, RateLimitState>();

function getBodyString(request: HttpRequestLike): string {
  if (request.body === undefined || request.body === null) {
    return "";
  }
  if (typeof request.body === "string") {
    return request.body;
  }
  try {
    return JSON.stringify(request.body);
  } catch {
    return "";
  }
}

function verifyRateLimit(key: string, perMin: number): boolean {
  const now = Date.now();
  const current = rateLimits.get(key);
  if (!current || now - current.windowStartMs >= 60_000) {
    rateLimits.set(key, { windowStartMs: now, used: 1 });
    return true;
  }
  if (current.used >= Math.max(1, perMin)) {
    return false;
  }
  current.used += 1;
  return true;
}

function constantTimeEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifyInternalSignature(
  request: HttpRequestLike,
  signingKey: string
): { ok: boolean; reason?: string } {
  const timestampRaw = request.headers["x-evernet-ts"];
  const signatureRaw = request.headers["x-evernet-signature"];
  const timestamp = Array.isArray(timestampRaw) ? timestampRaw[0] : timestampRaw;
  const signature = Array.isArray(signatureRaw) ? signatureRaw[0] : signatureRaw;
  if (!timestamp || !signature) {
    return { ok: false, reason: "missing_signature" };
  }

  const tsMs = Date.parse(timestamp);
  if (!Number.isFinite(tsMs) || Math.abs(Date.now() - tsMs) > MAX_SKEW_MS) {
    return { ok: false, reason: "invalid_timestamp" };
  }

  const body = getBodyString(request);
  const payload = `${request.method}\n${request.url.split("?")[0]}\n${timestamp}\n${body}`;
  const expected = createHmac("sha256", signingKey).update(payload).digest("hex");
  if (!constantTimeEquals(expected, signature)) {
    return { ok: false, reason: "signature_mismatch" };
  }

  return { ok: true };
}

export function buildInternalAuthHeaders(args: {
  method: string;
  path: string;
  body?: string;
  signingKey?: string;
}): Record<string, string> {
  if (!args.signingKey) {
    return {};
  }
  const timestamp = new Date().toISOString();
  const payload = `${args.method.toUpperCase()}\n${args.path}\n${timestamp}\n${args.body ?? ""}`;
  const signature = createHmac("sha256", args.signingKey).update(payload).digest("hex");
  return {
    "x-evernet-ts": timestamp,
    "x-evernet-signature": signature
  };
}

export async function enforceInternalAuth(
  request: HttpRequestLike,
  reply: HttpReplyLike,
  logger: Logger,
  metrics: ServiceMetrics,
  config: InternalAuthGuardConfig,
  audit: InternalAuthAuditContext = {}
): Promise<boolean> {
  if (!config.enabled || !config.shouldProtect(request)) {
    return true;
  }

  const traceId = audit.traceId ?? String(request.headers["x-trace-id"] ?? "");
  const tenantId = audit.tenantId;
  const ip = request.ip ?? "unknown";
  const routeKey = `${ip}:${request.url.split("?")[0]}`;
  const rateOk = verifyRateLimit(routeKey, config.rateLimitPerMin);
  if (!rateOk) {
    metrics.internalRateLimitedTotal.labels(config.serviceName, config.scopeTag).inc();
    logger.warn("internal auth rejected by rate limit", {
      tenant_id: tenantId ?? "unknown",
      trace_id: traceId || "n/a",
      ip,
      path: request.url
    });
    reply.status(429).send({ error: "rate limit exceeded" });
    return false;
  }

  if (!config.signingKey) {
    metrics.internalAuthFailTotal.labels(config.serviceName, config.scopeTag, "missing_key").inc();
    logger.warn("internal auth signing key missing", {
      tenant_id: tenantId ?? "unknown",
      trace_id: traceId || "n/a",
      path: request.url
    });
    reply.status(401).send({ error: "signing key is not configured" });
    return false;
  }

  const signature = verifyInternalSignature(request, config.signingKey);
  if (!signature.ok) {
    metrics.internalAuthFailTotal.labels(config.serviceName, config.scopeTag, signature.reason ?? "invalid_signature").inc();
    logger.warn("internal auth signature failed", {
      tenant_id: tenantId ?? "unknown",
      trace_id: traceId || "n/a",
      path: request.url,
      reason: signature.reason
    });
    reply.status(401).send({ error: "invalid signature" });
    return false;
  }

  return true;
}
