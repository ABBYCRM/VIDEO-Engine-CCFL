// tests/unit/aion-policy.test.ts
//
// Tests the per-tier behavior of the AION policy. The completeness guard
// (every real CLAW_TOOLS entry must appear in some set) lives in
// tests/unit/aion-policy-completeness.test.ts so a missing classification
// surfaces as a separate, sharply-named failure.

import assert from "node:assert/strict";
import test from "node:test";
import { decideTool } from "../../lib/aion/policy.ts";

test("destructive tools defer without exact confirmation", () => {
  const d = decideTool("delete_library_asset", "Delete that asset");
  assert.equal(d.state, "DEFER");
  assert.equal(d.riskLevel, "destructive");
  assert.equal(d.confirmationRequired, true);
  assert.equal(d.confidence, 0);
});

test("destructive tools commit after exact confirmation", () => {
  const d = decideTool("delete_library_asset", "CONFIRM delete_library_asset");
  assert.equal(d.state, "COMMIT");
  assert.equal(d.riskLevel, "destructive");
  assert.equal(d.confidence, 1);
});

test("destructive confirmation is case-insensitive and exact-only", () => {
  const ok = decideTool("delete_library_asset", "  confirm delete_library_asset  ");
  assert.equal(ok.state, "COMMIT");

  const nope = decideTool("delete_library_asset", "yes please delete it");
  assert.equal(nope.state, "DEFER");

  const nopePartial = decideTool(
    "delete_library_asset",
    "I confirm delete_library_asset, do it now"
  );
  assert.equal(nopePartial.state, "DEFER");
});

test("external_post tools defer without confirmation", () => {
  const d = decideTool("ig_publish", "Please publish this reel");
  assert.equal(d.state, "DEFER");
  assert.equal(d.riskLevel, "external_post");
});

test("external_post tools commit after exact confirmation", () => {
  const d = decideTool("ig_publish", "CONFIRM ig_publish");
  assert.equal(d.state, "COMMIT");
  assert.equal(d.riskLevel, "external_post");
});

test("code tools commit only with exact confirmation", () => {
  const d = decideTool("coding_run", "Run the test suite");
  assert.equal(d.state, "DEFER");
  assert.equal(d.riskLevel, "code");

  const ok = decideTool("coding_run", "CONFIRM coding_run");
  assert.equal(ok.state, "COMMIT");
  assert.equal(ok.riskLevel, "code");
});

test("external_reply tools auto-commit but log as OBSERVATION (no CONFIRM gate)", () => {
  const d = decideTool("ig_reply_comment", "reply to the top comment with thanks");
  assert.equal(d.state, "COMMIT");
  assert.equal(d.riskLevel, "external_reply");
  assert.equal(d.confirmationRequired, false);
});

test("costly tools auto-commit (generation is explicit-by-ask, not gated)", () => {
  const d = decideTool("generate_video", "make a 15s reel of this");
  assert.equal(d.state, "COMMIT");
  assert.equal(d.riskLevel, "costly");
});

test("read tools auto-commit", () => {
  const d = decideTool("ig_list_media", "show me recent posts");
  assert.equal(d.state, "COMMIT");
  assert.equal(d.riskLevel, "read");
});

test("unknown tools are rejected (no silent fallback)", () => {
  const d = decideTool("invented_production_tool", "run it");
  assert.equal(d.state, "REJECT");
  assert.equal(d.rationale.toLowerCase().includes("absent from"), true);
});

test("update_calendar is external_post (can authorize a real future publish)", () => {
  const d = decideTool("update_calendar", "schedule the post for friday");
  assert.equal(d.state, "DEFER");
  assert.equal(d.riskLevel, "external_post");
});

test("save_post is read-tier (no auto-post by its own description)", () => {
  const d = decideTool("save_post", "save this draft");
  assert.equal(d.state, "COMMIT");
  assert.equal(d.riskLevel, "read");
});
