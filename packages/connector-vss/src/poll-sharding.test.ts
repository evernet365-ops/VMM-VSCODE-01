import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildPollShardingPlan,
  hashCameraId,
  normalizeShardingConfig
} from "./poll-sharding.js";

describe("poll-sharding", () => {
  it("normalizes invalid config values safely", () => {
    const normalized = normalizeShardingConfig({
      bucketCount: 0,
      maxConcurrency: -1,
      siteConcurrency: 0,
      rateLimitPerSec: -9,
      staggerEnabled: true
    });

    assert.equal(normalized.bucketCount, 60);
    assert.equal(normalized.maxConcurrency, 32);
    assert.equal(normalized.siteConcurrency, 6);
    assert.equal(normalized.rateLimitPerSec, 50);
    assert.equal(normalized.staggerEnabled, true);
  });

  it("hash is deterministic", () => {
    assert.equal(hashCameraId("cam-a-1"), hashCameraId("cam-a-1"));
    assert.notEqual(hashCameraId("cam-a-1"), hashCameraId("cam-a-2"));
  });

  it("builds stable plan by bucket", () => {
    const plan = buildPollShardingPlan(
      ["cam-a-1", "cam-a-2", "cam-a-3", "cam-a-4"],
      60_000,
      normalizeShardingConfig({
        bucketCount: 4,
        maxConcurrency: 30,
        siteConcurrency: 5,
        rateLimitPerSec: 20,
        staggerEnabled: true
      })
    );

    assert.ok(plan.bucketIndex >= 0 && plan.bucketIndex < 4);
    assert.ok(plan.effectiveConcurrency <= 5);
    assert.equal(plan.minLaunchGapMs, 50);
    for (const cameraId of plan.selectedCameraIds) {
      assert.equal(hashCameraId(cameraId) % 4, plan.bucketIndex);
    }
  });
});
