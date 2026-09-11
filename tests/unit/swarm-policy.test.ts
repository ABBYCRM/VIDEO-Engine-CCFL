import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  defaultPlan,
  extractJsonObject,
  guardFetchUrl,
  parseLimits,
  parsePlannerOutput,
  sanitizeObjective,
  validatePlan,
} from "../../lib/swarm/policy.ts";

describe("swarm policy", () => {
  it("caps agents and deadline", () => {
    const limits = parseLimits({ maxAgents: 99, deadlineMs: 9, maxLlmCalls: 99 });
    assert.equal(limits.maxAgents, 4);
    assert.equal(limits.deadlineMs, 30_000);
    assert.equal(limits.maxLlmCalls, 8);
  });

  it("rejects empty and oversized objectives", () => {
    assert.equal(sanitizeObjective("").ok, false);
    assert.equal(sanitizeObjective("x".repeat(2001)).ok, false);
    assert.equal(sanitizeObjective("Compare two queues").ok, true);
  });

  it("blocks private fetch targets", () => {
    assert.equal(guardFetchUrl("http://127.0.0.1/secret").ok, false);
    assert.equal(guardFetchUrl("http://169.254.169.254/latest/meta-data").ok, false);
    assert.equal(guardFetchUrl("https://example.com").ok, true);
  });

  it("default plan always has a leader and respects maxAgents", () => {
    const two = defaultPlan("obj", 2);
    assert.equal(two.length, 2);
    assert.ok(two.some((t) => t.role === "synthesizer"));
    const four = defaultPlan("obj", 4);
    assert.equal(four.length, 4);
    const checked = validatePlan(four, parseLimits({ maxAgents: 4 }));
    assert.equal(checked.ok, true);
  });

  it("rejects cyclic and oversized DAGs", () => {
    const cycle = validatePlan(
      [
        { id: "a", role: "researcher", objective: "a", dependsOn: ["b"] },
        { id: "b", role: "researcher", objective: "b", dependsOn: ["a"] },
        { id: "synth", role: "synthesizer", objective: "s", dependsOn: ["a"] },
      ],
      parseLimits({ maxAgents: 4 }),
    );
    assert.equal(cycle.ok, false);
    const big = validatePlan(defaultPlan("obj", 4), parseLimits({ maxAgents: 2 }));
    assert.equal(big.ok, false);
  });

  it("parses planner JSON even when fenced", () => {
    const text = '```json\n{"tasks":[{"id":"research-a","role":"researcher","objective":"A","depends_on":[]},{"id":"synth","role":"synthesizer","objective":"S","depends_on":["research-a"]}]}\n```';
    const tasks = parsePlannerOutput(text, parseLimits({ maxAgents: 2 }));
    assert.equal(tasks.length, 2);
    assert.equal(tasks[1].dependsOn[0], "research-a");
    assert.deepEqual(extractJsonObject('noise {"ok":true} tail'), { ok: true });
  });
});
