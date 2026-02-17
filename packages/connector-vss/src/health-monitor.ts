export type CameraHealthState = "OK" | "DEGRADED" | "DOWN" | "BLACKFRAME";

export interface HealthSample {
  reconnects?: number | null;
  fps?: number | null;
  dropFrames?: number | null;
  lastFrameTsMs?: number | null;
  nowMs: number;
  staleTimeoutMs: number;
  offline?: boolean | null;
}
          
export interface HealthTrendWindow {
  frameIntervalsMs?: number[];
  recentStates?: CameraHealthState[];
  enableJitter?: boolean;
  stabilityThreshold?: number;
}

export interface HealthResult {
  state: CameraHealthState;
  changed: boolean;
  reason: string;
  jitterMs?: number;
  stabilityScore?: number;
}

function isStale(sample: HealthSample): boolean {
  if (sample.lastFrameTsMs === null || sample.lastFrameTsMs === undefined) {
    return true;
  }
  const age = sample.nowMs - sample.lastFrameTsMs;
  return age < 0 ? false : age > sample.staleTimeoutMs;
}

export function calculateJitterMs(frameIntervalsMs?: number[]): number | undefined {
  if (!frameIntervalsMs || frameIntervalsMs.length < 2) {
    return undefined;
  }
  const valid = frameIntervalsMs.filter((value) => Number.isFinite(value) && value >= 0);
  if (valid.length < 2) {
    return undefined;
  }
  const mean = valid.reduce((sum, value) => sum + value, 0) / valid.length;
  const variance = valid.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / valid.length;
  return Math.sqrt(variance);
}

export function calculateStabilityScore(recentStates?: CameraHealthState[]): number | undefined {
  if (!recentStates || recentStates.length === 0) {
    return undefined;
  }
  const okCount = recentStates.filter((state) => state === "OK").length;
  return okCount / recentStates.length;
}

export function evaluateHealth(
  previous: CameraHealthState,
  sample: HealthSample,
  trend?: HealthTrendWindow
): HealthResult {
  // Default to DOWN if critical inputs are missing to satisfy fail-soft.
  let next: CameraHealthState = "DOWN";
  let reason = "no data";

  if (sample.offline) {
    next = "DOWN";
    reason = "marked offline";
  } else if (isStale(sample)) {
    next = "DOWN";
    reason = "stream stale";
  } else if ((sample.fps ?? 0) === 0) {
    next = "BLACKFRAME";
    reason = "fps is zero";
  } else {
    const fps = sample.fps ?? 0;
    const drop = sample.dropFrames ?? 0;
    const reconnects = sample.reconnects ?? 0;

    const degradedByFps = fps > 0 && fps < 10;
    const degradedByDrop = drop > 5;
    const degradedByReconnect = reconnects > 0;

    if (degradedByFps || degradedByDrop || degradedByReconnect) {
      next = "DEGRADED";
      if (degradedByFps) reason = "low fps";
      else if (degradedByDrop) reason = "high drop frames";
      else reason = "recent reconnect";
    } else {
      next = "OK";
      reason = "healthy stream";
    }
  }

  const jitterMs = trend?.enableJitter ? calculateJitterMs(trend.frameIntervalsMs) : undefined;
  const stabilityScore = trend?.enableJitter ? calculateStabilityScore(trend.recentStates) : undefined;
  const stabilityThreshold = trend?.stabilityThreshold ?? 0.9;

  if (
    trend?.enableJitter &&
    next === "OK" &&
    stabilityScore !== undefined &&
    stabilityScore < stabilityThreshold
  ) {
    next = "DEGRADED";
    reason = "long-term instability";
  }

  return {
    state: next,
    changed: next !== previous,
    reason,
    jitterMs,
    stabilityScore
  };
}
