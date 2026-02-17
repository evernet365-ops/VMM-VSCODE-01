export type EventDedupConfig = {
  enabled: boolean;
  windowSec: number;
  minIntervalSec: number;
};

export type EventDedupResult = {
  allow: boolean;
  reason: "pass" | "window" | "interval";
};

type EventDedupState = {
  lastSeenMs: number;
  lastEmittedMs: number;
};

export class EventDedupGuard {
  private readonly state = new Map<string, EventDedupState>();

  constructor(private readonly config: EventDedupConfig) {}

  check(key: string, nowMs: number): EventDedupResult {
    if (!this.config.enabled || key.length === 0) {
      return { allow: true, reason: "pass" };
    }

    const windowMs = Math.max(1, Math.floor(this.config.windowSec)) * 1000;
    const minIntervalMs = Math.max(1, Math.floor(this.config.minIntervalSec)) * 1000;
    const current = this.state.get(key);
    if (!current) {
      this.state.set(key, { lastSeenMs: nowMs, lastEmittedMs: nowMs });
      return { allow: true, reason: "pass" };
    }

    if (nowMs - current.lastSeenMs <= windowMs) {
      current.lastSeenMs = nowMs;
      return { allow: false, reason: "window" };
    }

    current.lastSeenMs = nowMs;
    if (nowMs - current.lastEmittedMs < minIntervalMs) {
      return { allow: false, reason: "interval" };
    }

    current.lastEmittedMs = nowMs;
    return { allow: true, reason: "pass" };
  }
}
