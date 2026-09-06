import { Execution, parseToolCalls, awaitWithSignal, toolSucceeded } from "../../lib/claw/execution.ts";
import { SelfStateController, createSelfState } from "../../lib/claw/self-state.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import vm from "node:vm";

// Execute the real turn loop with only I/O dependencies substituted. This
// avoids Next's @/ aliases and needs no database, provider keys, or network.
const runtimeSource = readFileSync(new URL("../../lib/claw/runtime.ts", import.meta.url), "utf8");
const executable = stripTypeScriptTypes(runtimeSource)
  .replace(/^import .*;\r?$/gm, "")
  .replace("export async function runClawTurn", "async function runClawTurn");

async function runWithResult(payload: unknown) {
  const messages: any[] = [];
  const events: any[] = [];
  const requests: any[] = [];
  const context = vm.createContext({
    AbortController, AbortSignal, setTimeout, clearTimeout, Execution, parseToolCalls, awaitWithSignal,
    getClawModel: () => "test-model",
    isNvidiaEnabled: () => true,
    getConversation: () => ({ title: "Existing thread" }),
    listMessages: () => [...messages],
    addMessage: (message: unknown) => messages.push(message),
    renameConversation: () => {},
    readClawFileText: async () => "",
    toolsCatalog: () => "composio_action",
    toolsAsOpenAI: () => [],
    CLAW_TOOL_NAMES: ["composio_action"],
    SelfStateController,
    createSelfState,
    executeClawTool: async () => payload,
    chatCompletionStream: async (request: any, onToken: (text: string) => void) => {
      requests.push(request);
      const text = requests.length === 1
        ? '<tool_call name="composio_action">{"slug":"GITHUB_GET_REPOSITORY"}</tool_call>'
        : "Read the result.";
      onToken(text);
      return { text, finishReason: "stop" };
    },
  });
  vm.runInContext(executable, context);
  await context.runClawTurn({
    conversationId: "test-thread",
    text: "Read the repository",
    onEvent: (event: unknown) => events.push(event),
  });
  return { messages, events, requests };
}

for (const [label, payload] of [
  ["Composio response", { ok: true, data: { successful: true, data: { name: "Aion-brain", commits: [{ sha: "abc123" }] } }, via: "composio" }],
  ["array", [{ sha: "abc123" }, { sha: "def456" }]],
  ["structured error", { ok: false, error: { message: "Repository not found", status: 404 } }],
  ["plain text", "Already serialized text"],
  ["JSON text", '{"data":{"name":"Aion-brain"}}'],
  ["null", null],
  ["undefined", undefined],
  ["false", false],
  ["zero", 0],
  ["clipped response", { _clawTruncated: true, _clawOriginalLength: 9000, _clawPreview: '{"data":' }],
] as const) {
  test(`tool result preserves ${label} in history, next model request, and SSE preview`, async () => {
    const { messages, requests, events } = await runWithResult(payload);
    const expected = JSON.stringify({ evidenceId: "e1", revision: 1, ok: toolSucceeded(payload), result: payload });
    const body = `<tool_result name="composio_action">${expected}</tool_result>`;
    assert.equal(messages.find(m => m.role === "tool").content, body);
    assert.ok(requests[1].messages.some((m: any) => m.content === `tool_result:\n${body}`));
    const end = events.find(e => e.type === "tool_end");
    assert.equal(end.preview, expected);
    assert.equal(end.ok, toolSucceeded(payload));
    assert.equal(events.at(-1).type, "done");
  });
}

test("long result keeps model payload intact while limiting the console preview", async () => {
  const payload = { data: "x".repeat(1000) };
  const { messages, events } = await runWithResult(payload);
  const expected = JSON.stringify({ evidenceId: "e1", revision: 1, ok: true, result: payload });
  assert.ok(messages.find(m => m.role === "tool").content.includes(expected));
  assert.equal(events.find(e => e.type === "tool_end").preview, expected.slice(0, 280) + "…");
});

test("native tool_calls execute, update previous_tool_results, and appear in SELF_STATE", async () => {
  const messages: any[] = [];
  const events: any[] = [];
  const requests: any[] = [];
  const context = vm.createContext({
    AbortController, AbortSignal, setTimeout, clearTimeout, Execution, parseToolCalls, awaitWithSignal,
    SelfStateController, createSelfState,
    getClawModel: () => "nvidia/nemotron-3-ultra-550b-a55b",
    isNvidiaEnabled: () => true,
    getConversation: () => ({ title: "Existing thread" }),
    listMessages: () => [...messages],
    addMessage: (message: unknown) => messages.push(message),
    renameConversation: () => {},
    readClawFileText: async () => "",
    toolsCatalog: () => "steel_scrape",
    toolsAsOpenAI: () => [{ type: "function", function: { name: "steel_scrape", description: "scrape", parameters: { type: "object" } } }],
    CLAW_TOOL_NAMES: ["steel_scrape"],
    executeClawTool: async () => ({ ok: true, via: "steel.dev", markdown: "# Example Domain" }),
    chatCompletionStream: async (request: any, onToken: (text: string) => void) => {
      requests.push(request);
      if (requests.length === 1) {
        return {
          text: "",
          finishReason: "tool_calls",
          toolCalls: [{ id: "call_1", type: "function", function: { name: "steel_scrape", arguments: "{\"url\":\"https://example.com\"}" } }],
          reasoningContent: "need the page"
        };
      }
      onToken("Example Domain is a placeholder.");
      return { text: "Example Domain is a placeholder.", finishReason: "stop", toolCalls: [], reasoningContent: "" };
    },
  });
  vm.runInContext(executable, context);
  const final = await context.runClawTurn({
    conversationId: "test-thread",
    text: "Summarize https://example.com",
    onEvent: (event: unknown) => events.push(event),
  });
  assert.ok(requests[0].tools?.length);
  assert.equal(events.find((e: any) => e.type === "tool_start")?.name, "steel_scrape");
  assert.equal(events.find((e: any) => e.type === "tool_end")?.ok, true);
  assert.ok(events.some((e: any) => e.type === "self_state"));
  const checkpoint = messages.find((m: any) => m.toolJson?.name === "execution_checkpoint");
  assert.ok(checkpoint?.toolJson?.execution || checkpoint?.content.includes("steel"));
  assert.ok(messages.some((m: any) => m.role === "tool" && String(m.content).includes("steel.dev")));
  assert.match(String(final), /Example Domain|placeholder/i);
});

test("unserializable result produces a tool error instead of losing the turn", async () => {
  const payload: any = {};
  payload.self = payload;
  const { messages, events } = await runWithResult(payload);
  assert.equal(events.find(e => e.type === "tool_end").ok, false);
  assert.match(messages.find(m => m.role === "tool").content, /ERROR:/);
  assert.equal(events.at(-1).type, "done");
});
