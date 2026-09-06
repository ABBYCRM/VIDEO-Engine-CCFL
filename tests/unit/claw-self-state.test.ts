import test from "node:test";
import assert from "node:assert/strict";
import { SelfStateController, createSelfState } from "../../lib/claw/self-state.ts";

function controller(goal = "Research https://example.com") {
  const state = createSelfState({
    goal,
    tools: ["steel_scrape", "web_search", "aion_consult", "execution_plan", "execution_blocked"],
    maxRounds: 8,
    budgetMs: 60_000
  });
  return new SelfStateController(state, { maxRounds: 8, budgetMs: 60_000 });
}

test("LOOP_DETECTED forces a strategy change and forbids the same action", () => {
  const self = controller();
  self.setStrategy("retry-steel");
  self.recordStrategyFailure("retry-steel", "steel_scrape:{\"url\":\"https://example.com\"}");
  self.recordStrategyFailure("retry-steel", "steel_scrape:{\"url\":\"https://example.com\"}");
  const cycle = self.cycle({ round: 2 });
  assert.equal(cycle.health, "LOOP_DETECTED");
  assert.equal(cycle.issue, "STRATEGY_FAILURE");
  assert.equal(cycle.forbidRetry, true);
  assert.equal(cycle.requireDifferentAction, true);
  assert.notEqual(self.state.current_strategy, "retry-steel");
  assert.ok(self.isForbidden("retry-steel", "steel_scrape:{\"url\":\"https://example.com\"}"));
  assert.match(cycle.instruction, /materially different/);
});

test("tool invocation updates previous_tool_results and known facts", () => {
  const self = controller();
  self.recordTool({
    name: "steel_scrape",
    ok: true,
    preview: '{"via":"steel.dev","title":"Example"}',
    evidenceId: "e1"
  });
  assert.equal(self.state.previous_tool_results.length, 1);
  assert.equal(self.state.previous_tool_results[0].name, "steel_scrape");
  assert.equal(self.state.previous_tool_results[0].ok, true);
  assert.equal(self.state.previous_tool_results[0].evidenceId, "e1");
  assert.equal(self.state.tool_status.steel_scrape, "ok");
  assert.ok(self.state.known_facts.some((f) => f.status === "KNOWN" && f.claim.includes("steel_scrape")));
  assert.ok(self.state.assumptions.every((a) => a.status === "ASSUMED"));
});

test("false COMPLETE is blocked until acceptance is verified", () => {
  const self = controller("Create a report");
  const refused = self.terminationCheck({
    wantsComplete: true,
    acceptanceVerified: false,
    requiresAcceptance: true,
    hasPendingToolIntent: false
  });
  assert.equal(refused.complete, false);
  assert.match(refused.reason, /acceptance criteria/i);
  const intended = self.terminationCheck({
    wantsComplete: true,
    acceptanceVerified: true,
    requiresAcceptance: true,
    hasPendingToolIntent: true
  });
  assert.equal(intended.complete, false);
  assert.match(intended.reason, /not executed/);
  const ok = self.terminationCheck({
    wantsComplete: true,
    acceptanceVerified: true,
    requiresAcceptance: true,
    hasPendingToolIntent: false
  });
  assert.equal(ok.complete, true);
});

test("Aion previous_tool_results become local evidence without proving COMPLETE", () => {
  const self = controller();
  self.ingestAionResults([{ name: "web_search", ok: true, preview: "hits", evidence_id: "ev1" }]);
  assert.equal(self.state.previous_tool_results[0].name, "web_search");
  assert.equal(self.state.previous_tool_results[0].evidenceId, "ev1");
  const refused = self.terminationCheck({
    wantsComplete: true,
    acceptanceVerified: false,
    requiresAcceptance: true,
    hasPendingToolIntent: false
  });
  assert.equal(refused.complete, false);
});

test("SELF_STATE snapshot includes every required control field", () => {
  const self = controller();
  const s = self.snapshot();
  for (const key of [
    "active_goal", "current_plan", "current_step", "completed_steps", "pending_steps",
    "working_memory", "relevant_long_term_memory", "assumptions", "known_facts",
    "unknowns", "uncertainties", "current_strategy", "alternative_strategies",
    "available_tools", "tool_status", "previous_tool_results", "errors", "warnings",
    "blockers", "resource_usage", "remaining_budget", "progress", "confidence",
    "expected_outcome", "observed_outcome"
  ]) {
    assert.ok(key in s, `missing ${key}`);
  }
  const pub = self.publicSnapshot();
  assert.ok(!JSON.stringify(pub).includes("nvapi-"));
  assert.ok(!JSON.stringify(pub).includes("ak_"));
});

