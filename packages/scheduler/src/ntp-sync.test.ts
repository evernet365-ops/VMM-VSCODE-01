import { test } from "node:test";
import assert from "node:assert/strict";
import type { Logger, ServiceMetrics } from "@evernet/shared";
import { NtpSyncController, clampSyncIntervalMin } from "./ntp-sync.js";

function createLogger(): Logger {
  return {
    info: () => {},
    warn: () => {},
    error: () => {}
  };
}

function createMetrics(): ServiceMetrics {
  const counter = { labels: () => ({ inc: () => {} }) };
  const gauge = { labels: () => ({ set: () => {} }) };
  return {
    ntpSyncTotal: counter,
    ntpOffsetMs: gauge,
    ntpLastSyncTs: gauge,
    ntpServerRequestTotal: counter
  } as unknown as ServiceMetrics;
}

test("clampSyncIntervalMin keeps range 1..9999", () => {
  assert.equal(clampSyncIntervalMin(0), 1);
  assert.equal(clampSyncIntervalMin(10_000), 9_999);
  assert.equal(clampSyncIntervalMin(60), 60);
});

test("ntp sync is fail-soft on timeout/offline errors", async () => {
  const controller = new NtpSyncController({
    serviceName: "scheduler",
    logger: createLogger(),
    metrics: createMetrics(),
    config: {
      enabled: true,
      siteId: "site-a",
      upstreamHost: "time.google.com",
      upstreamPort: 123,
      syncIntervalMin: 60,
      requestTimeoutMs: 100,
      serverEnabled: false,
      serverHost: "0.0.0.0",
      serverPort: 123
    },
    queryFn: async () => {
      throw new Error("timeout");
    }
  });

  controller.start();
  await new Promise((resolve) => setTimeout(resolve, 10));
  const status = controller.getStatus();
  controller.stop();

  assert.equal(status.enabled, true);
  assert.equal(status.mode, "system");
  assert.equal(status.lastError, "timeout");
});

test("manual time handles null and invalid input without crash", () => {
  const controller = new NtpSyncController({
    serviceName: "scheduler",
    logger: createLogger(),
    metrics: createMetrics(),
    config: {
      enabled: true,
      siteId: "site-a",
      upstreamHost: "time.google.com",
      upstreamPort: 123,
      syncIntervalMin: 60,
      requestTimeoutMs: 100,
      serverEnabled: false,
      serverHost: "0.0.0.0",
      serverPort: 123
    },
    queryFn: async () => Date.now()
  });

  const invalid = controller.setManualTime("not-a-date");
  assert.equal(invalid.accepted, false);

  const clear = controller.setManualTime();
  assert.equal(clear.accepted, true);
  controller.stop();
});
