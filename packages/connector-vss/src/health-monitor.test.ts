import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateHealth, type CameraHealthState } from "./health-monitor.js";

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
});
