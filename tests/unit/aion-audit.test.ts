// tests/unit/aion-audit.test.ts
//
// Tests the heuristic audit. Honest about being a heuristic — anything
// more rigorous would require comparing model text against structured
// payload fields, which is a separate (and harder) problem.

import assert from "node:assert/strict";
import test from "node:test";
import { auditAssistantResponse } from "../../lib/aion/audit.ts";

test("audit passes when no tool failed and no claim of success", () => {
  const r = auditAssistantResponse("Here's what I see in your library.", [
    { name: "list_library", ok: true }
  ]);
  assert.equal(r.passed, true);
  assert.deepEqual(r.flags, []);
});

test("audit passes when tool succeeded and assistant claims success", () => {
  const r = auditAssistantResponse("Successfully published the reel.", [
    { name: "ig_publish", ok: true }
  ]);
  assert.equal(r.passed, true);
});

test("audit flags FAILED_TOOL_DESCRIBED_AS_SUCCESS", () => {
  const r = auditAssistantResponse("Successfully published the reel.", [
    { name: "ig_publish", ok: false, error: "rate limited" }
  ]);
  assert.equal(r.passed, false);
  assert.equal(r.flags[0]?.code, "FAILED_TOOL_DESCRIBED_AS_SUCCESS");
  assert.equal(r.flags[0]?.severity, "HIGH");
});

test("audit flags FAILED_TOOL_IGNORED when assistant text never mentions the failed tool", () => {
  const r = auditAssistantResponse("All done — your library is in great shape.", [
    { name: "delete_library_asset", ok: false, error: "permission denied" }
  ]);
  assert.equal(r.passed, false);
  assert.equal(r.flags.some((f) => f.code === "FAILED_TOOL_IGNORED"), true);
});

test("audit does not flag FAILED_TOOL_IGNORED when the assistant acknowledges the failure", () => {
  const r = auditAssistantResponse(
    "I tried delete_library_asset but it failed with permission denied.",
    [{ name: "delete_library_asset", ok: false, error: "permission denied" }]
  );
  // No claim of success; assistant mentions the failed tool. Should pass.
  assert.equal(r.passed, true);
});
