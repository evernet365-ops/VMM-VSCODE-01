function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface RetryPolicy {
  timeoutMs: number;
  retries: number;
  backoffMs: number;
}

const defaultPolicy: RetryPolicy = {
  timeoutMs: 3000,
  retries: 3,
  backoffMs: 300
};

export async function requestWithRetry(
  url: string,
  init: RequestInit,
  policy: Partial<RetryPolicy> = {}
): Promise<Response> {
  const merged = { ...defaultPolicy, ...policy };
  let lastError: unknown;

  for (let attempt = 0; attempt <= merged.retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), merged.timeoutMs);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          ...(init.headers ?? {})
        }
      });

      clearTimeout(timer);

      if (response.ok) {
        return response;
      }

      lastError = new Error(`Request failed: HTTP ${response.status}`);
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
    }

    if (attempt < merged.retries) {
      const backoff = merged.backoffMs * Math.pow(2, attempt);
      await sleep(backoff);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("requestWithRetry failed");
}

export class CircuitBreaker {
  private state: "closed" | "open" | "half_open" = "closed";
  private failureCount = 0;
  private lastFailureAt: Date | undefined;
  private openedAt: Date | undefined;
  private lastLatencyMs = 0;

  constructor(
    private readonly failureThreshold = 5,
    private readonly latencyThresholdMs = 5000,
    private readonly resetTimeoutMs = 30000
  ) {}

  canRequest(now = new Date()): boolean {
    if (this.state === "open") {
      if (this.openedAt && now.getTime() - this.openedAt.getTime() >= this.resetTimeoutMs) {
        this.state = "half_open";
        return true;
      }
      return false;
    }
    return true;
  }

  recordSuccess(latencyMs: number): void {
    this.lastLatencyMs = latencyMs;
    this.failureCount = 0;
    this.state = "closed";
    this.openedAt = undefined;
  }

  recordFailure(latencyMs: number): void {
    this.lastLatencyMs = latencyMs;
    this.failureCount += 1;
    this.lastFailureAt = new Date();

    if (this.failureCount >= this.failureThreshold || latencyMs > this.latencyThresholdMs) {
      this.state = "open";
      this.openedAt = new Date();
    }
  }

  snapshot() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureAt: this.lastFailureAt,
      openedAt: this.openedAt,
      lastLatencyMs: this.lastLatencyMs
    };
  }
}
