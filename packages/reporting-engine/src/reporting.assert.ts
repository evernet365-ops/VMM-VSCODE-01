import assert from "node:assert/strict";
import { createServiceMetrics } from "@evernet/shared";
import { toManagementInterval } from "./management-report.js";
import { playbackWithFallback, type PlaybackQuery } from "./playback.js";

class FakePoolSuccess {
  async query() {
    return {
      rowCount: 1,
      rows: [{ ts: new Date().toISOString(), file: "/recordings/idx.mp4", durationSec: 60 }]
    };
  }
}

class FakePoolFail {
  async query() {
    throw new Error("index unavailable");
  }
}

async function runPlaybackAssertions(): Promise<void> {
  const query: PlaybackQuery = {
    siteId: "site-a",
    cameraId: "cam-1",
    start: new Date(Date.now() - 3_600_000).toISOString(),
    end: new Date().toISOString(),
    page: 0,
    pageSize: 10
  };

  const m1 = createServiceMetrics("reporting-engine");
  const r1 = await playbackWithFallback(new FakePoolSuccess() as never, m1, "reporting-engine", query, true);
  assert.equal(r1.source, "index");

  const m2 = createServiceMetrics("reporting-engine");
  const r2 = await playbackWithFallback(new FakePoolFail() as never, m2, "reporting-engine", query, true);
  assert.equal(r2.source, "fallback");
  assert.ok(r2.items.length > 0);

  const m3 = createServiceMetrics("reporting-engine");
  await assert.rejects(
    playbackWithFallback(new FakePoolFail() as never, m3, "reporting-engine", query, false),
    /index unavailable/
  );
}

function runManagementAssertions(): void {
  assert.equal(toManagementInterval("15m"), "15 minutes");
  assert.equal(toManagementInterval("24h"), "24 hours");
  assert.equal(toManagementInterval("7d"), "7 days");
  assert.equal(toManagementInterval("bad"), "1 hour");
}

async function main(): Promise<void> {
  runManagementAssertions();
  await runPlaybackAssertions();
  console.log("test:ok @evernet/reporting-engine");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
