import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calculateJitterMs,
  calculateStabilityScore,
  evaluateHealth,
  type CameraHealthState
} from "./health-monitor.js";

const now = Date.now();

describe("health-monitor", () => {
  it("returns OK for healthy stream", () => {
    const result = evaluateHealth("DOWN", {
      reconnects: 0,
      fps: 24,
      dropFrames: 0,
      lastFrameTsMs: now - 500,
      nowMs: now,
      staleTimeoutMs: 10_000
    });

    assert.equal(result.state, "OK");
    assert.equal(result.changed, true);
  });

  it("returns DEGRADED for low fps", () => {
    const result = evaluateHealth("OK", {
      reconnects: 0,
      fps: 8,
      dropFrames: 0,
      lastFrameTsMs: now - 1_000,
      nowMs: now,
      staleTimeoutMs: 10_000
    });

    assert.equal(result.state, "DEGRADED");
    assert.equal(result.changed, true);
  });

  it("returns DOWN when stream is stale", () => {
    const result = evaluateHealth("OK", {
      reconnects: 0,
      fps: 20,
      dropFrames: 0,
      lastFrameTsMs: now - 60_000,
      nowMs: now,
      staleTimeoutMs: 5_000
    });

    assert.equal(result.state, "DOWN");
    assert.equal(result.changed, true);
  });

  it("returns BLACKFRAME when fps is zero", () => {
    const result = evaluateHealth("DEGRADED", {
      reconnects: 0,
      fps: 0,
      dropFrames: 0,
      lastFrameTsMs: now - 800,
      nowMs: now,
      staleTimeoutMs: 5_000
    });

    assert.equal(result.state, "BLACKFRAME");
    assert.equal(result.changed, true);
  });

  it("returns DOWN for offline flag even if recent frame exists", () => {
    const result = evaluateHealth("OK", {
      reconnects: 1,
      fps: 25,
      dropFrames: 0,
      lastFrameTsMs: now - 500,
      nowMs: now,
      staleTimeoutMs: 5_000,
      offline: true
    });

    assert.equal(result.state, "DOWN");
    assert.equal(result.changed, true);
  });

  it("is fail-soft for missing metrics (no crash)", () => {
    const previous: CameraHealthState = "DOWN";
    const result = evaluateHealth(previous, {
      reconnects: null,
      fps: null,
      dropFrames: null,
      lastFrameTsMs: null,
      nowMs: now,
      staleTimeoutMs: 5_000
    });

    assert.equal(result.state, "DOWN");
    assert.equal(result.changed, false);
  });

  it("calculates jitter from frame intervals", () => {
    const jitter = calculateJitterMs([30, 40, 20, 35]);
    assert.equal(typeof jitter, "number");
    assert.equal((jitter ?? 0) > 0, true);
  });

  it("calculates stability score from recent states", () => {
    const score = calculateStabilityScore(["OK", "OK", "DEGRADED", "OK"]);
    assert.equal(score, 0.75);
  });

  it("degrades by long-term instability when jitter feature is enabled", () => {
    const result = evaluateHealth(
      "OK",
      {
        reconnects: 0,
        fps: 24,
        dropFrames: 0,
        lastFrameTsMs: now - 500,
        nowMs: now,
        staleTimeoutMs: 10_000
      },
      {
        enableJitter: true,
        frameIntervalsMs: [33, 36, 35, 34],
        recentStates: ["OK", "DEGRADED", "DOWN", "OK"],
        stabilityThreshold: 0.9
      }
    );

    assert.equal(result.state, "DEGRADED");
    assert.equal(result.reason, "long-term instability");
    assert.equal((result.jitterMs ?? 0) > 0, true);
    assert.equal(result.stabilityScore, 0.5);
  });
});
