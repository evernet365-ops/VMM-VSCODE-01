import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toManagementInterval } from "./management-report.js";

describe("management-report helpers", () => {
  it("maps supported windows", () => {
    assert.equal(toManagementInterval("15m"), "15 minutes");
    assert.equal(toManagementInterval("24h"), "24 hours");
    assert.equal(toManagementInterval("7d"), "7 days");
  });

  it("falls back to 1 hour for invalid window", () => {
    assert.equal(toManagementInterval("bad"), "1 hour");
    assert.equal(toManagementInterval(""), "1 hour");
  });
});
