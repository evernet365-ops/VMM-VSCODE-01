import { createHash } from "node:crypto";

export type RolloutScope = "site" | "tenant" | "camera";

export type RolloutContext = {
  siteId?: string;
  tenantId?: string;
  cameraId?: string;
};

export type RolloutConfig = {
  enabled: boolean;
  percent: number;
  scope: RolloutScope;
};

export type RolloutDecision = {
  sampled: boolean;
  hashBucket: number;
  stickyValue: string;
};

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return Math.floor(value);
}

function resolveStickyValue(scope: RolloutScope, context: RolloutContext): string {
  if (scope === "camera") {
    return context.cameraId ?? context.siteId ?? context.tenantId ?? "unknown";
  }
  if (scope === "tenant") {
    return context.tenantId ?? context.siteId ?? "unknown";
  }
  return context.siteId ?? context.tenantId ?? "unknown";
}

function toBucket(input: string): number {
  const digest = createHash("sha256").update(input).digest();
  const raw = digest.readUInt32BE(0);
  return raw % 100;
}

export function resolveRolloutScope(raw?: string): RolloutScope {
  if (raw === "tenant" || raw === "camera") {
    return raw;
  }
  return "site";
}

export function evaluateRollout(
  feature: string,
  config: RolloutConfig,
  context: RolloutContext
): RolloutDecision {
  const stickyValue = resolveStickyValue(config.scope, context);
  if (!config.enabled) {
    return { sampled: true, hashBucket: 0, stickyValue };
  }
  const percent = clampPercent(config.percent);
  if (percent <= 0) {
    return { sampled: false, hashBucket: 99, stickyValue };
  }
  if (percent >= 100) {
    return { sampled: true, hashBucket: 0, stickyValue };
  }

  const hashBucket = toBucket(`${feature}:${config.scope}:${stickyValue}`);
  return {
    sampled: hashBucket < percent,
    hashBucket,
    stickyValue
  };
}
