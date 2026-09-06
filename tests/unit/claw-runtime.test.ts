import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import { Execution, parseToolCalls, awaitWithSignal } from "../../lib/claw/execution.ts";
import { SelfStateController, createSelfState } from "../../lib/claw/self-state.ts";

const runtimeSource = readFileSync(new URL("../../lib/claw/runtime.ts", import.meta.url), "utf8");
const executable = stripTypeScriptTypes(runtimeSource)
  .replace(/^import .*;\r?$/gm, "")
  .replace("export async function runClawTurn", "async function runClawTurn");

function harness(responses: any[], result: unknown = { ok: true, id: "f1", size: 42, url: "/file/f1" }) {
  const messages: any[] = [];
  const events: any[] = [];
  const calls: string[] = [];
  const context = vm.createContext({
    AbortController, AbortSignal, setTimeout, clearTimeout, Execution, parseToolCalls, awaitWithSignal,
    SelfStateController, createSelfState,
    getClawModel: () => "test",
    isNvidiaEnabled: () => true,
    getConversation: () => ({ title: "Existing" }),
    listMessages: () => [...messages],
    addMessage: (m: unknown) => messages.push(m),
    renameConversation: () => {},
    readClawFileText: async () => "",
    toolsCatalog: () => "save_file",
    toolsAsOpenAI: () => [],
    CLAW_TOOL_NAMES: ["save_file"],
    executeClawTool: async (name: string) => { calls.push(name); return result; },
    chatCompletionStream: async (_req: unknown, cb: (t: string) => void) => {
      const r = responses.shift() || { text: "Done, production ready!", finishReason: "stop" };
      if (r.text) cb(r.text);
      return r;
    }
  });
  vm.runInContext(executable, context);
  return {
    messages, events, calls,
    run: () => context.runClawTurn({ conversationId: "c1", text: "Create a report", onEvent: (e: unknown) => events.push(e) })
  };
}

const response = (text: string, finishReason = "stop") => ({ text, finishReason });
const call = (name: string, args: unknown) => response(`<tool_call name="${name}">${JSON.stringify(args)}</tool_call>`);
const plan = call("execution_plan", { goal: "Create report", steps: ["save", "verify"], checks: [{ id: "file", kind: "artifact", description: "Report saved" }] });

test("runtime withholds unsupported final claims and records a blocked result", async () => {
  const h = harness([]);
  const final = await h.run();
  assert.match(final, /blocked \/ unverified|acceptance criteria|required evidence/i);
  assert.doesNotMatch(final, /production ready/);
  assert.equal(h.calls.length, 0);
});

test("runtime finishes only after actual save and verification", async () => {
  const h = harness([plan, call("save_file", { name: "report.md", content: "Report" }), call("execution_verify", { check: "file", evidence: "e1" }), response("Saved: /file/f1")]);
  const final = await h.run();
  assert.match(final, /Status: verified checks/);
  assert.match(final, /PASS: Report saved \(e1\)/);
  assert.deepEqual(h.calls, ["save_file"]);
});

test("length cutoff resumes incomplete call without executing it twice", async () => {
  const h = harness([plan, response('<tool_call name="save_file">{"name":"report.md","content":"hel', "length"), response('lo"}</tool_call>'), call("execution_verify", { check: "file", evidence: "e1" }), response("Saved.")]);
  const final = await h.run();
  assert.match(final, /verified checks/);
  assert.deepEqual(h.calls, ["save_file"]);
});

test("structured tool failure cannot be green or certify the task", async () => {
  const h = harness([plan, call("save_file", { name: "x", content: "x" }), call("execution_verify", { check: "file", evidence: "e1" })], { ok: false, error: "disk full" });
  const final = await h.run();
  assert.match(final, /unverified/);
  assert.equal(h.events.find(e => e.type === "tool_end" && e.name === "save_file").ok, false);
});

test("native tool_calls execute and emit self_state without XML", async () => {
  const h = harness([
    plan,
    { text: "", finishReason: "tool_calls", toolCalls: [{ id: "call_1", type: "function", function: { name: "save_file", arguments: JSON.stringify({ name: "report.md", content: "Report" }) } }], reasoningContent: "saving" },
    call("execution_verify", { check: "file", evidence: "e1" }),
    response("Saved.")
  ]);
  const final = await h.run();
  assert.match(final, /verified checks/);
  assert.deepEqual(h.calls, ["save_file"]);
  assert.ok(h.events.some(e => e.type === "self_state"));
  assert.ok(h.events.some(e => e.type === "tool_start" && e.name === "save_file"));
});

test("continuation limit preserves unfinished text and never emits Done", async () => {
  const h = harness([response("partial ", "length"), response("partial ", "length"), response("partial ", "length"), response("partial ", "length")]);
  const final = await h.run();
  assert.match(final, /continuation limit/);
  assert.ok(h.messages.some(m => String(m.content).startsWith("Unfinished draft")));
  assert.deepEqual(h.calls, []);
});
