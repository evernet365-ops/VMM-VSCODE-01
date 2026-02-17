import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { playbackWithFallback, type PlaybackQuery } from "./playback.js";
import { createServiceMetrics } from "@evernet/shared";

class FakePoolSuccess {
  async query() {
    return {
      rowCount: 1,
      rows: [
        { ts: new Date().toISOString(), file: "/recordings/idx.mp4", durationSec: 60 }
      ]
    };
  }
}

class FakePoolFail {
  async query() {
    throw new Error("index unavailable");
  }
}

const baseQuery: PlaybackQuery = {
  siteId: "site-a",
  cameraId: "cam-1",
  start: new Date(Date.now() - 3_600_000).toISOString(),
  end: new Date().toISOString(),
  page: 0,
  pageSize: 10
};

describe("playbackWithFallback", () => {
  it("returns index results when index is available", async () => {
    const metrics = createServiceMetrics("reporting-engine");
    const result = await playbackWithFallback(new FakePoolSuccess() as any, metrics, "reporting-engine", baseQuery, true);
    assert.equal(result.source, "index");
    assert.equal(result.items.length, 1);
  });

  it("uses fallback when index fails and flag is ON", async () => {
    const metrics = createServiceMetrics("reporting-engine");
    const result = await playbackWithFallback(new FakePoolFail() as any, metrics, "reporting-engine", baseQuery, true);
    assert.equal(result.source, "fallback");
    assert.ok(result.items.length > 0);
  });

  it("throws when index fails and flag is OFF", async () => {
    const metrics = createServiceMetrics("reporting-engine");
    await assert.rejects(
      playbackWithFallback(new FakePoolFail() as any, metrics, "reporting-engine", baseQuery, false),
      /index unavailable/
    );
  });
});
