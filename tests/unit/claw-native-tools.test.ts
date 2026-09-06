import { Execution, parseToolCalls, awaitWithSignal, toolSucceeded } from "../../lib/claw/execution.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import vm from "node:vm";

const runtimeSource = readFileSync(new URL("../../lib/claw/runtime.ts", import.meta.url), "utf8");
const executable = stripTypeScriptTypes(runtimeSource)
  .replace(/^import .*;\r?$/gm, "")
  .replace("export async function runClawTurn", "async function runClawTurn");

function runNative() {
  const messages: any[] = [];
  const events: any[] = [];
  const requests: any[] = [];
  const calls: string[] = [];
  const payload = { via: "exa", results: [{ title: "Example", url: "https://example.com", snippet: "ok" }] };
  const context = vm.createContext({
    AbortController, AbortSignal, setTimeout, clearTimeout, Execution, parseToolCalls, awaitWithSignal, toolSucceeded,
    getClawModel: () => "nvidia/nemotron-3-super-120b-a12b",
    isNvidiaEnabled: () => true,
    getConversation: () => ({ title: "Existing thread" }),
    listMessages: () => [...messages],
    addMessage: (message: unknown) => messages.push(message),
    renameConversation: () => {},
    readClawFileText: async () => "",
    toolsCatalog: () => "web_search",
    executeClawTool: async (name: string) => { calls.push(name); return payload; },
    nvidiaToolDefinitions: () => [{ type: "function", function: { name: "web_search", description: "search", parameters: { type: "object" } } }],
    parseNativeToolCalls: (c: any[] = []) => c.map((x, i) => ({
      id: x.id || String(i),
      name: x.function.name,
      args: JSON.parse(x.function.arguments || "{}")
    })),
    assistantToolPayload: (toolCalls: unknown, reasoningContent?: string) => ({ kind: "assistant_turn", reasoningContent, calls: toolCalls }),
    getAssistantCalls: (j: any) => Array.isArray(j) ? j : (j?.calls || []),
    getAssistantReasoning: (j: any) => j?.reasoningContent,
    chatCompletionStream: async (request: any, onToken: (text: string) => void) => {
      requests.push(request);
      if (requests.length === 1) {
        return {
          text: "",
          finishReason: "tool_calls",
          toolCalls: [{ id: "call_web", type: "function", function: { name: "web_search", arguments: '{"query":"nvidia nim tools"}' } }]
        };
      }
      const answer = "NVIDIA NIM tool calling is documented at integrate.api.nvidia.com.";
      onToken(answer);
      return { text: answer, finishReason: "stop" };
    }
  });
  vm.runInContext(executable, context);
  return context.runClawTurn({
    conversationId: "c-native",
    text: "What does NVIDIA say about NIM tool calling? Search the web.",
    onEvent: (event: unknown) => events.push(event)
  }).then((final: string) => ({ final, messages, events, requests, calls, payload }));
}

test("chat → native tool_call → tool result → final answer (no think loop)", async () => {
  const { final, messages, events, requests, calls, payload } = await runNative();
  assert.deepEqual(calls, ["web_search"]);
  assert.ok(requests[0].tools?.length, "first NVIDIA request must register tools");
  assert.equal(requests[0].toolChoice, "auto");
  assert.ok(events.some((e: any) => e.type === "tool_start" && e.name === "web_search"));
  assert.ok(events.some((e: any) => e.type === "tool_end" && e.name === "web_search" && e.ok === true));
  const toolMsg = messages.find((m: any) => m.role === "tool");
  assert.match(toolMsg.content, /example\.com/);
  assert.equal(toolMsg.toolJson.toolCallId, "call_web");
  const followUp = requests[1].messages;
  assert.ok(followUp.some((m: any) => m.role === "tool" && m.tool_call_id === "call_web"), "tool result must be fed back as role=tool");
  assert.ok(followUp.some((m: any) => m.role === "assistant" && Array.isArray(m.tool_calls)));
  assert.match(JSON.stringify(followUp.find((m: any) => m.role === "tool")), new RegExp(payload.results[0].url.replace(/\./g, "\\.")));
  assert.match(final, /integrate\.api\.nvidia\.com/);
  assert.doesNotMatch(final, /blocked \/ unverified/);
  assert.doesNotMatch(final, /round limit reached/);
  assert.equal(events.at(-1).type, "done");
  assert.equal(requests.length, 2, "must finish after one tool round, not loop");
});
