import {
  selectSiteForBucket,
  type SiteWeight
} from "@evernet/shared";

export interface PollShardingConfig {
  bucketCount: number;
  maxConcurrency: number;
  siteConcurrency: number;
  rateLimitPerSec: number;
  staggerEnabled: boolean;
}

export interface SiteAwareShardingConfig {
  enabled: boolean;
  siteId: string;
  siteWeights: SiteWeight[];
}

export interface PollShardingPlan {
  bucketIndex: number;
  selectedCameraIds: string[];
  effectiveConcurrency: number;
  minLaunchGapMs: number;
  siteSelected: boolean;
  activeSiteId?: string;
}

function sanitizePositiveInt(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.floor(value);
}

export function normalizeShardingConfig(raw: PollShardingConfig): PollShardingConfig {
  return {
    bucketCount: Math.max(1, sanitizePositiveInt(raw.bucketCount, 60)),
    maxConcurrency: Math.max(1, sanitizePositiveInt(raw.maxConcurrency, 32)),
    siteConcurrency: Math.max(1, sanitizePositiveInt(raw.siteConcurrency, 6)),
    rateLimitPerSec: Math.max(1, sanitizePositiveInt(raw.rateLimitPerSec, 50)),
    staggerEnabled: Boolean(raw.staggerEnabled)
  };
}

export function hashCameraId(cameraId: string): number {
  let hash = 0;
  for (let i = 0; i < cameraId.length; i += 1) {
    hash = (hash * 31 + cameraId.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function buildPollShardingPlan(
  cameraIds: string[],
  nowMs: number,
  config: PollShardingConfig,
  siteAware?: SiteAwareShardingConfig
): PollShardingPlan {
  const normalized = normalizeShardingConfig(config);
  const bucketIndex = Math.floor(nowMs / 1000) % normalized.bucketCount;
  const activeSiteId = siteAware?.enabled
    ? selectSiteForBucket(bucketIndex, siteAware.siteWeights)
    : undefined;
  const siteSelected = !siteAware?.enabled || !activeSiteId || activeSiteId === siteAware.siteId;
  const selectedCameraIds = siteSelected
    ? cameraIds.filter((cameraId) => (hashCameraId(cameraId) % normalized.bucketCount) === bucketIndex)
    : [];
  const effectiveConcurrency = Math.min(normalized.maxConcurrency, normalized.siteConcurrency);
  const minLaunchGapMs = Math.max(1, Math.floor(1000 / normalized.rateLimitPerSec));

  return {
    bucketIndex,
    selectedCameraIds,
    effectiveConcurrency,
    minLaunchGapMs,
    siteSelected,
    activeSiteId
  };
}
