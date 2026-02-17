import type { Severity } from "./types.js";

export interface SiteWeight {
  siteId: string;
  weight: number;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function addJitter(baseMs: number, jitterSec: number): number {
  const jitterMs = randomInt(-jitterSec * 1000, jitterSec * 1000);
  return Math.max(1000, baseMs + jitterMs);
}

export function calculatePollDelayMs(
  severity: Severity,
  normalSec: number,
  jitterSec: number
): number {
  if (severity === "critical") {
    return 1000;
  }
  if (severity === "suspect") {
    return 60 * 1000;
  }
  return addJitter(normalSec * 1000, jitterSec);
}

function sanitizePositiveInt(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.floor(value);
}

export function normalizeBucketCount(rawBucketCount: number, fallback = 60): number {
  return Math.max(1, sanitizePositiveInt(rawBucketCount, fallback));
}

export function parseSiteWeights(raw: string | undefined, fallbackSiteIds: string[]): SiteWeight[] {
  const fallback = fallbackSiteIds.map((siteId) => ({ siteId, weight: 1 }));
  if (!raw) {
    return fallback;
  }

  const parsed: SiteWeight[] = [];
  for (const token of raw.split(",").map((value) => value.trim()).filter(Boolean)) {
    const split = token.indexOf(":");
    if (split <= 0) {
      continue;
    }
    const siteId = token.slice(0, split).trim();
    const weightRaw = token.slice(split + 1).trim();
    const weight = Number(weightRaw);
    if (!siteId || !Number.isFinite(weight) || weight <= 0) {
      continue;
    }
    parsed.push({ siteId, weight: Math.floor(weight) });
  }

  return parsed.length > 0 ? parsed : fallback;
}

export function selectSiteForBucket(bucketIndex: number, siteWeights: SiteWeight[]): string | undefined {
  if (siteWeights.length === 0) {
    return undefined;
  }

  const totalWeight = siteWeights.reduce((sum, item) => sum + Math.max(1, item.weight), 0);
  const slot = ((bucketIndex % totalWeight) + totalWeight) % totalWeight;

  let cursor = 0;
  for (const item of siteWeights) {
    cursor += Math.max(1, item.weight);
    if (slot < cursor) {
      return item.siteId;
    }
  }
  return siteWeights[siteWeights.length - 1]?.siteId;
}
