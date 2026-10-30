import { test } from "node:test";
import assert from "node:assert/strict";
import { safeNext } from "../../apps/web/lib/api.js";

test("return destinations stay within the app routes", () => {
  for (const value of [
    null,
    "",
    "https://example.com/app",
    "//example.com/app",
    "/application",
    "/app/../outside",
    "/app/%2e%2e/outside",
    "/app\\outside",
    "/app?redirect=elsewhere",
    "/app#outside",
    "/app/with space",
    "/app/" + "x".repeat(513),
  ]) {
    assert.equal(safeNext(value), "/app");
  }
  assert.equal(safeNext("/app/create"), "/app/create");
  assert.equal(safeNext("/app/settings/password"), "/app/settings/password");
});
