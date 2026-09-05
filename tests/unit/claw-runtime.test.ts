import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

const state = { messages: [] as any[], responses: [] as any[], events: [] as any[], calls: [] as string[], result: {} as unknown };
(globalThis as any).__clawRuntimeTest = state;
const sources: Record<string, string> = {
  "@/lib/nvidia/client": `export const isNvidiaEnabled=()=>true; export const getClawModel=()=>"test"; export const chatCompletionStream=async(req,cb)=>{const s=globalThis.__clawRuntimeTest;const r=s.responses.shift()||{text:"Done, production ready!",finishReason:"stop"};cb(r.text);return r;};`,
  "@/lib/claw/store": `export const getConversation=()=>({title:"Existing"}); export const renameConversation=()=>{}; export const readClawFileText=async()=>"";export const listMessages=()=>globalThis.__clawRuntimeTest.messages;export const addMessage=m=>{globalThis.__clawRuntimeTest.messages.push(m);return m;};`,
  "@/lib/claw/tools": `export const toolsCatalog=()=>"save_file";export const executeClawTool=async(name)=>{const s=globalThis.__clawRuntimeTest;s.calls.push(name);return s.result;};`
};
const hooks = registerHooks({ resolve(specifier, context, next) {
  if (sources[specifier]) return { url: "data:text/javascript," + encodeURIComponent(sources[specifier]), shortCircuit: true };
  if (specifier === "./execution") return next("./execution.ts", context);
  return next(specifier, context);
} });
const { runClawTurn } = await import("../../lib/claw/runtime.ts");
hooks.deregister();
function reset(responses: any[], result: unknown = { ok: true, id: "f1", size: 42, url: "/file/f1" }) {
  state.messages = []; state.calls = []; state.events = []; state.responses = responses; state.result = result;
}
const response = (text: string, finishReason = "stop") => ({ text, finishReason });
const call = (name: string, args: unknown) => response(`<tool_call name="${name}">${JSON.stringify(args)}</tool_call>`);
const plan = call("execution_plan", { goal: "Create report", steps: ["save", "verify"], checks: [{ id: "file", kind: "artifact", description: "Report saved" }] });
const run = () => runClawTurn({ conversationId: "c1", text: "Create a report", onEvent: e => state.events.push(e) });

test("runtime withholds unsupported final claims and records a blocked result", async () => {
  reset([]);
  const final = await run();
  assert.match(final, /blocked \/ unverified/);
  assert.doesNotMatch(final, /production ready/);
  assert.equal(state.calls.length, 0);
  assert.equal(state.events.some(e => e.type === "token" && e.text.includes("production ready")), false);
});
test("runtime finishes only after actual save and verification", async () => {
  reset([plan, call("save_file", { name: "report.md", content: "Report" }), call("execution_verify", { check: "file", evidence: "e1" }), response("Saved: /file/f1")]);
  const final = await run();
  assert.match(final, /Status: verified checks/);
  assert.match(final, /PASS: Report saved \(e1\)/);
  assert.deepEqual(state.calls, ["save_file"]);
});
test("length cutoff resumes incomplete call without executing it twice", async () => {
  reset([plan, response('<tool_call name="save_file">{"name":"report.md","content":"hel', "length"), response('lo"}</tool_call>'), call("execution_verify", { check: "file", evidence: "e1" }), response("Saved.")]);
  const final = await run();
  assert.match(final, /verified checks/);
  assert.deepEqual(state.calls, ["save_file"]);
});
test("structured tool failure cannot be green or certify the task", async () => {
  reset([plan, call("save_file", { name: "x", content: "x" }), call("execution_verify", { check: "file", evidence: "e1" })], { ok: false, error: "disk full" });
  const final = await run();
  assert.match(final, /unverified/);
  assert.equal(state.events.find(e => e.type === "tool_end" && e.name === "save_file").ok, false);
});
test("continuation limit preserves unfinished text and never emits Done", async () => {
  reset([response("partial ", "length"), response("partial ", "length"), response("partial ", "length"), response("partial ", "length")]);
  const final = await run();
  assert.match(final, /continuation limit/);
  assert.ok(state.messages.some(m => m.content.startsWith("Unfinished draft")));
  assert.deepEqual(state.calls, []);
});
