import assert from "node:assert/strict";
import test from "node:test";
import { resolveDashboardUiVersion } from "./ui-version.js";

test("resolveDashboardUiVersion returns v1 when feature is off", () => {
  assert.equal(resolveDashboardUiVersion(false), "v1");
});

test("resolveDashboardUiVersion returns v2 when feature is on", () => {
  assert.equal(resolveDashboardUiVersion(true), "v2");
});
