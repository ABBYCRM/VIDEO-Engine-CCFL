import { Execution, parseToolCalls, awaitWithSignal } from "../../lib/claw/execution.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import vm from "node:vm";

const runtimeSource = readFileSync(new URL("../../lib/claw/runtime.ts", import.meta.url), "utf8");
const executable = stripTypeScriptTypes(runtimeSource)
  .replace(/^import .*;\r?$/gm, "")
  .replace("export async function runClawTurn", "async function runClawTurn");

const state = { messages: [] as any[], responses: [] as any[], events: [] as any[], calls: [] as string[], result: {} as unknown };

function runTurn() {
  const context = vm.createContext({
    AbortController, AbortSignal, setTimeout, clearTimeout, Execution, parseToolCalls, awaitWithSignal,
    getClawModel: () => "test",
    isNvidiaEnabled: () => true,
    getConversation: () => ({ title: "Existing" }),
    listMessages: () => [...state.messages],
    addMessage: (m: any) => { state.messages.push(m); return m; },
    renameConversation: () => {},
    readClawFileText: async () => "",
    toolsCatalog: () => "save_file",
    executeClawTool: async (name: string) => { state.calls.push(name); return state.result; },
    nvidiaToolDefinitions: () => [],
    parseNativeToolCalls: (c: any[] = []) => c.map((x, i) => ({
      id: x.id || String(i),
      name: x.function?.name || x.name,
      args: typeof x.function?.arguments === "string" ? JSON.parse(x.function.arguments || "{}") : x.args || {}
    })),
    assistantToolPayload: (calls: unknown, r?: string) => ({ kind: "assistant_turn", reasoningContent: r, calls }),
    getAssistantCalls: (j: any) => Array.isArray(j) ? j : (j && j.calls) || [],
    getAssistantReasoning: (j: any) => j && j.reasoningContent,
    chatCompletionStream: async (_req: any, cb: (text: string) => void) => {
      const r = state.responses.shift() || { text: "Done, production ready!", finishReason: "stop" };
      cb(r.text);
      return r;
    }
  });
  vm.runInContext(executable, context);
  return context.runClawTurn({ conversationId: "c1", text: "Create a report", onEvent: (e: any) => state.events.push(e) });
}

function reset(responses: any[], result: unknown = { ok: true, id: "f1", size: 42, url: "/file/f1" }) {
  state.messages = []; state.calls = []; state.events = []; state.responses = responses; state.result = result;
}
const response = (text: string, finishReason = "stop") => ({ text, finishReason });
const call = (name: string, args: unknown) => response(`<tool_call name="${name}">${JSON.stringify(args)}</tool_call>`);
const plan = call("execution_plan", { goal: "Create report", steps: ["save", "verify"], checks: [{ id: "file", kind: "artifact", description: "Report saved" }] });

test("runtime withholds unsupported final claims and records a blocked result", async () => {
  reset([]);
  const final = await runTurn();
  assert.match(final, /blocked \/ unverified/);
  assert.doesNotMatch(final, /production ready/);
  assert.equal(state.calls.length, 0);
  assert.equal(state.events.some(e => e.type === "token" && e.text.includes("production ready")), false);
});
test("runtime finishes only after actual save and verification", async () => {
  reset([plan, call("save_file", { name: "report.md", content: "Report" }), call("execution_verify", { check: "file", evidence: "e1" }), response("Saved: /file/f1")]);
  const final = await runTurn();
  assert.match(final, /Status: verified checks/);
  assert.match(final, /PASS: Report saved \(e1\)/);
  assert.deepEqual(state.calls, ["save_file"]);
});
test("length cutoff resumes incomplete call without executing it twice", async () => {
  reset([plan, response('<tool_call name="save_file">{"name":"report.md","content":"hel', "length"), response('lo"}</tool_call>'), call("execution_verify", { check: "file", evidence: "e1" }), response("Saved.")]);
  const final = await runTurn();
  assert.match(final, /verified checks/);
  assert.deepEqual(state.calls, ["save_file"]);
});
test("structured tool failure cannot be green or certify the task", async () => {
  reset([plan, call("save_file", { name: "x", content: "x" }), call("execution_verify", { check: "file", evidence: "e1" })], { ok: false, error: "disk full" });
  const final = await runTurn();
  assert.match(final, /unverified/);
  assert.equal(state.events.find(e => e.type === "tool_end" && e.name === "save_file").ok, false);
});
test("continuation limit preserves unfinished text and never emits Done", async () => {
  reset([response("partial ", "length"), response("partial ", "length"), response("partial ", "length"), response("partial ", "length")]);
  const final = await runTurn();
  assert.match(final, /continuation limit/);
  assert.ok(state.messages.some(m => m.content.startsWith("Unfinished draft")));
  assert.deepEqual(state.calls, []);
});
