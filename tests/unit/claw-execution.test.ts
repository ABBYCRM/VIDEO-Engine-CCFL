import test from "node:test";
import assert from "node:assert/strict";
import { Execution, parseToolCalls, toolSucceeded, awaitWithSignal } from "../../lib/claw/execution.ts";
import { StreamState } from "../../lib/nvidia/stream-state.ts";

function planned() {
  const e = new Execution(["command", "artifact"]);
  e.plan({ goal: "Build app", steps: ["write", "build"], checks: [{ id: "build", description: "Build exits 0", kind: "command" }, { id: "file", description: "File saved", kind: "artifact" }] });
  return e;
}
test("completion requires evidence; model claims and incomplete criteria do not pass", () => {
  const e = planned();
  assert.equal(e.verified, false);
  assert.throws(() => e.verify({ check: "build", evidence: "invented" }));
  const claim = e.record("aion_consult", { exit_code: 0 });
  assert.throws(() => e.verify({ check: "build", evidence: claim.id, path: "exit_code" }));
  assert.throws(() => e.plan({ goal: "Just write a file", steps: ["write"], checks: [] }));
  assert.match(e.report("Budget exhausted"), /blocked \/ unverified/);
});
test("verification requires current exit code and saved artifact; edits invalidate it", () => {
  const e = planned();
  e.begin("composio_action");
  const fail = e.record("composio_action", { ok: true, data: { exit_code: 1 } });
  assert.throws(() => e.verify({ check: "build", evidence: fail.id, path: "data.exit_code" }));
  const pass = e.record("composio_action", { ok: true, data: { exit_code: 0 } });
  e.verify({ check: "build", evidence: pass.id, path: "data.exit_code" });
  assert.equal(e.verified, false);
  const file = e.record("read_file", { id: "file1", size: 99 });
  e.verify({ check: "file", evidence: file.id });
  assert.equal(e.verified, true);
  e.begin("save_file");
  assert.equal(e.verified, false);
  assert.throws(() => e.verify({ check: "build", evidence: pass.id, path: "data.exit_code" }));
});
test("coding plans cannot omit execution checks", () => {
  assert.throws(() => new Execution(["command"]).plan({ goal: "app", steps: ["write"], checks: [{ id: "file", description: "saved", kind: "artifact" }] }));
});
test("returned tool errors are failures including nested MCP errors", () => {
  for (const result of [{ ok: false }, { successful: false }, { error: "failed" }, { data: { isError: true } }]) assert.equal(toolSucceeded(result), false);
  assert.equal(toolSucceeded({ ok: true, data: { exit_code: 0 } }), true);
});
test("malformed batch executes nothing and arguments are not repaired or guessed", () => {
  assert.throws(() => parseToolCalls('<tool_call name="save_file">{"name":"x"}</tool_call><tool_call name="delete_file">'));
  assert.throws(() => parseToolCalls('<tool_call name="x">{\'id\':1}</tool_call>'));
  assert.throws(() => parseToolCalls('<tool_call name="x">[]</tool_call>'));
  assert.deepEqual(parseToolCalls('<tool_call name="x">{"id":1}</tool_call>'), [{ name: "x", args: { id: 1 } }]);
});
test("stream EOF and DONE alone cannot masquerade as completion", () => {
  const chunks: string[] = [];
  const stream = new StreamState(s => chunks.push(s));
  stream.feed('data: {"choices":[{"delta":{"content":"half"}}]}\n');
  stream.feed('data: [DONE]\n');
  stream.end();
  assert.equal(stream.finishReason, "interrupted");
  assert.equal(stream.text, "half");
  assert.deepEqual(chunks, ["half"]);
});
test("split SSE packets and a final line without newline retain length/stop", () => {
  const stream = new StreamState(() => {});
  stream.feed('data: {"choices":[{"delta":{"con');
  stream.feed('tent":"code"},"finish_reason":"length"}]}');
  stream.end();
  assert.equal(stream.finishReason, "length");
  assert.equal(stream.text, "code");
  const complete = new StreamState(() => {});
  complete.feed('data: {"choices":[{"finish_reason":"stop"}]}\n');
  assert.equal(complete.finishReason, "stop");
});
test("budget abort stops waiting without replaying operation or leaking late rejection", async () => {
  let reject!: (error: Error) => void;
  const operation = new Promise<never>((_, r) => { reject = r; });
  const controller = new AbortController();
  const waiting = awaitWithSignal(operation, controller.signal);
  controller.abort(new Error("budget"));
  await assert.rejects(waiting, /budget/);
  reject(new Error("late operation failure"));
  await Promise.resolve();
});
