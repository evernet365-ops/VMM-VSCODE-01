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

export interface HealthResult {
  state: CameraHealthState;
  changed: boolean;
  reason: string;
}

function isStale(sample: HealthSample): boolean {
  if (sample.lastFrameTsMs === null || sample.lastFrameTsMs === undefined) {
    return true;
  }
  const age = sample.nowMs - sample.lastFrameTsMs;
  return age < 0 ? false : age > sample.staleTimeoutMs;
}

export function evaluateHealth(previous: CameraHealthState, sample: HealthSample): HealthResult {
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

  return {
    state: next,
    changed: next !== previous,
    reason
  };
}
