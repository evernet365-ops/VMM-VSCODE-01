import test from "node:test";
import assert from "node:assert/strict";
import { EventDedupGuard, evaluateRollout } from "@evernet/shared";

test("evaluateRollout is deterministic for same feature/context", () => {
  const left = evaluateRollout(
    "health-jitter",
    { enabled: true, percent: 25, scope: "site" },
    { siteId: "site-a" }
  );
  const right = evaluateRollout(
    "health-jitter",
    { enabled: true, percent: 25, scope: "site" },
    { siteId: "site-a" }
  );

  assert.equal(left.hashBucket, right.hashBucket);
  assert.equal(left.sampled, right.sampled);
});

test("event dedup suppresses same key within window", () => {
  const guard = new EventDedupGuard({
    enabled: true,
    windowSec: 60,
    minIntervalSec: 120
  });
  const now = 1_000_000;
  const first = guard.check("site-a:camera-1:DOWN:timeout", now);
  const second = guard.check("site-a:camera-1:DOWN:timeout", now + 10_000);

  assert.equal(first.allow, true);
  assert.equal(second.allow, false);
  assert.equal(second.reason, "window");
});
