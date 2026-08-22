import test from "node:test";
import assert from "node:assert/strict";
import { Effort, getAgentDir } from "../src/host.ts";

test("host shim resolves getAgentDir and exposes canonical effort wire values", () => {
  assert.equal(typeof getAgentDir(), "string");
  assert.deepEqual(Effort, {
    Minimal: "minimal",
    Low: "low",
    Medium: "medium",
    High: "high",
    XHigh: "xhigh",
    Max: "max",
  });
});
