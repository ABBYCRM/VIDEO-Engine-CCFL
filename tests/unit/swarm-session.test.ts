import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { collectUpstream, runWorker } from "../../lib/swarm/worker.ts";
import type { ModelGateway, SwarmTask } from "../../lib/swarm/types.ts";

function task(partial: Partial<SwarmTask> & Pick<SwarmTask, "id" | "role" | "objective">): SwarmTask {
  return {
    runId: "run_test",
    parentId: null,
    dependsOn: [],
    urls: [],
    state: "ready",
    attempt: 0,
    provider: "test",
    model: "test",
    result: null,
    evidence: [],
    error: null,
    usage: { promptTokens: 0, completionTokens: 0, calls: 0 },
    startedAt: null,
    completedAt: null,
    ...partial,
  };
}

describe("swarm worker session", () => {
  it("researcher can fetch then done through the session loop", async () => {
    const replies = [
      JSON.stringify({ action: "done", output: "Claim: example.com is a reserved documentation domain." }),
    ];
    const gateway: ModelGateway = {
      name: "test",
      available: true,
      note: "test",
      complete: async () => {
        const text = replies.shift() || JSON.stringify({ action: "done", output: "fallback" });
        return { text, model: "test-model", provider: "test", usage: { promptTokens: 3, completionTokens: 5 } };
      },
    };
    const result = await runWorker({
      task: task({
        id: "research-a",
        role: "researcher",
        objective: "What is example.com?",
        urls: ["https://example.com"],
      }),
      upstream: "",
      gateway,
      remainingFetches: 2,
    });
    assert.match(result.text, /example.com/i);
    assert.ok(result.evidence.some((e) => e.includes("FETCH") || e.includes("example")));
    assert.equal(result.usage.completionTokens, 5);
  });

  it("collectUpstream forwards prior evidence not just prose", () => {
    const researcher = task({
      id: "research-a",
      role: "researcher",
      objective: "r",
      result: "The claim is X",
      evidence: ["FETCH https://example.com\nTITLE Example"],
      state: "completed",
    });
    const critic = task({
      id: "critic",
      role: "critic",
      objective: "c",
      dependsOn: ["research-a"],
    });
    const packed = collectUpstream(critic, [researcher, critic]);
    assert.match(packed, /The claim is X/);
    assert.match(packed, /EVIDENCE/);
    assert.match(packed, /example.com/);
  });
});
