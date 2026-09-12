import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildTaskBrief, parseSpawnSpec, workerSystemPrompt } from "../../lib/swarm/spawn.ts";
import { spawnEphemeralAgent, stopSwarmTask, waitSwarmTask } from "../../lib/swarm/supervisor.ts";
import type { ModelGateway } from "../../lib/swarm/types.ts";

function mockGateway(text = "Claim: example.com is reserved. Evidence: IANA."): ModelGateway {
  return {
    name: "test",
    available: true,
    note: "test",
    complete: async () => ({
      text: JSON.stringify({ action: "done", output: text }),
      model: "test-model",
      provider: "test",
      usage: { promptTokens: 2, completionTokens: 4 },
    }),
  };
}

describe("dynamic on-spot agent spawn", () => {
  it("parses an ad-hoc brief without requiring a prefab role", () => {
    const parsed = parseSpawnSpec({
      goal: "Find two sources on SQLite WAL",
      context: "single-node host",
      tools: ["search"],
      successCriteria: ["named URLs", "unknowns labeled"],
      label: "wal-scan",
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.spec.preset, null);
    assert.deepEqual(parsed.spec.tools, ["search"]);
    assert.equal(parsed.spec.label, "wal-scan");
    const brief = buildTaskBrief(parsed.spec);
    assert.match(workerSystemPrompt(brief, "worker"), /ephemeral worker spawned on the spot/);
    assert.match(workerSystemPrompt(brief, "worker"), /not a prefabricated specialist/);
  });

  it("ignores unknown roles and keeps optional presets opt-in", () => {
    const none = parseSpawnSpec({ goal: "x", role: "researcher-bot" });
    assert.equal(none.ok, true);
    if (none.ok) assert.equal(none.spec.preset, null);
    const preset = parseSpawnSpec({ goal: "x", preset: "critic" });
    assert.equal(preset.ok, true);
    if (preset.ok) assert.equal(preset.spec.preset, "critic");
  });

  it("spawns a worker without a role and reports a result back", async () => {
    const spawned = spawnEphemeralAgent({
      goal: "What is example.com for documentation?",
      context: "Need a one-line parent report",
      successCriteria: ["name the domain purpose"],
      label: "lookup",
      gateway: mockGateway(),
    });
    assert.equal(spawned.ok, true);
    if (!spawned.ok) return;
    assert.ok(spawned.taskId);
    assert.equal(spawned.brief.preset, null);
    assert.equal(spawned.run.tasks[0].role, "worker");
    assert.ok(spawned.run.tasks[0].brief);
    const waited = await waitSwarmTask({ runId: spawned.run.id, taskId: spawned.taskId, timeoutMs: 8000 });
    assert.equal(waited.ok, true);
    if (!waited.ok) return;
    assert.ok(waited.task);
    assert.ok(["completed", "failed", "running", "ready", "leased"].includes(waited.task.state));
    if (waited.task.state === "completed") {
      assert.match(String(waited.task.result || ""), /example\.com/i);
    }
  });

  it("spawns two independent workers on the same led run", async () => {
    const gw = mockGateway("ok");
    const first = spawnEphemeralAgent({ goal: "Worker A: list one fact about HTTP 204", gateway: gw });
    assert.equal(first.ok, true);
    if (!first.ok) return;
    const second = spawnEphemeralAgent({
      goal: "Worker B: list one fact about HTTP 304",
      runId: first.run.id,
      gateway: gw,
    });
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(second.run.id, first.run.id);
    assert.ok(second.run.tasks.length >= 2);
    assert.notEqual(first.taskId, second.taskId);
  });

  it("stops a wedged worker without requiring a prefab role", () => {
    const hanging: ModelGateway = {
      name: "test",
      available: true,
      note: "test",
      complete: async ({ signal }) => {
        await new Promise<void>((_resolve, reject) => {
          if (signal?.aborted) reject(new Error("Stopped"));
          signal?.addEventListener("abort", () => reject(new Error("Stopped")), { once: true });
        });
        return { text: "", model: "test", provider: "test", usage: { promptTokens: 0, completionTokens: 0 } };
      },
    };
    const spawned = spawnEphemeralAgent({ goal: "Hang until stopped", gateway: hanging });
    assert.equal(spawned.ok, true);
    if (!spawned.ok) return;
    const stopped = stopSwarmTask({ runId: spawned.run.id, taskId: spawned.taskId });
    assert.equal(stopped.ok, true);
    if (!stopped.ok) return;
    const task = stopped.run?.tasks.find((t) => t.id === spawned.taskId);
    assert.equal(task?.state, "cancelled");
  });
});
