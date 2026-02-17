import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseSiteWeights } from "@evernet/shared";
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
    assert.equal(plan.siteSelected, true);
    assert.equal(plan.activeSiteId, undefined);
  });

  it("supports site-aware weighted sharding and skips non-active site", () => {
    const siteWeights = parseSiteWeights("site-a:1,site-b:2", ["site-a", "site-b"]);
    let selectedForSiteA = 0;
    let selectedForSiteB = 0;

    for (let second = 0; second < 60; second += 1) {
      const nowMs = second * 1000;
      const planA = buildPollShardingPlan(
        ["cam-a-1", "cam-a-2", "cam-a-3"],
        nowMs,
        normalizeShardingConfig({
          bucketCount: 6,
          maxConcurrency: 10,
          siteConcurrency: 3,
          rateLimitPerSec: 20,
          staggerEnabled: true
        }),
        {
          enabled: true,
          siteId: "site-a",
          siteWeights
        }
      );
      const planB = buildPollShardingPlan(
        ["cam-b-1", "cam-b-2", "cam-b-3"],
        nowMs,
        normalizeShardingConfig({
          bucketCount: 6,
          maxConcurrency: 10,
          siteConcurrency: 3,
          rateLimitPerSec: 20,
          staggerEnabled: true
        }),
        {
          enabled: true,
          siteId: "site-b",
          siteWeights
        }
      );

      if (planA.siteSelected) selectedForSiteA += 1;
      if (planB.siteSelected) selectedForSiteB += 1;
    }

    assert.ok(selectedForSiteB > selectedForSiteA);
  });

  it("falls back safely when invalid weight config is provided", () => {
    const siteWeights = parseSiteWeights("bad,site-a:0,site-b:-1", ["site-a", "site-b"]);
    assert.equal(siteWeights.length, 2);
    assert.equal(siteWeights[0].weight, 1);
    assert.equal(siteWeights[1].weight, 1);
  });
});
