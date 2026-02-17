import type { Severity } from "./types.js";

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
