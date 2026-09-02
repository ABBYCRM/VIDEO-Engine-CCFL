// lib/claw/runtime.ts — Claw-only, no AION policy, no generation cap.
//
// 2026-08-30 "Claw only" repo strip + "remove all the rules and safeties
// from the Claw" operator directive. The previous version of this file
// imported lib/aion/policy, lib/aion/store, lib/aion/audit, and
// lib/generation-ledger to enforce:
//   - a RiskLevel-based tool gate (read / draft / costly /
//     external_post / external_reply / destructive / code) with an
//     exact-string "CONFIRM <tool_name>" operator override
//   - a daily generation cap (DAILY_GENERATION_LIMIT) on
//     generate_video / generate_still / ugc_batch_generate /
//     generate_blog_post
//   - an assistant-response audit that flags malformed tool-call syntax
//     and "fabricated tool result" hallucinations
// Every one of those safeties is gone now. The runtime is the bare
// loop: stream the LLM, parse <tool_call> blocks, execute them, append
// <tool_result> to the history, loop until the model writes a final
// answer. The operator is going to layer the rules back in one at a
// time as they use it (per their 2026-08-30 directive: "i will add
// them back one by one while I am using it. ot it will cause conflict").
//
// The tool definitions in lib/claw/tools.ts have already been pruned to
// the Claw-only set: app_status, composio_health, composio_action,
// steel_scrape, web_screenshot, web_search, analyze_image, list_files,
// read_file, rename_file, delete_file. None of those are external_post
// (Composio calls go through composio_action with an explicit slug +
// args + toolkit, so the "in and out granular" promise is enforced
// by the contract, not by a runtime gate).

import { chatCompletionStream, getClawModel, isNvidiaEnabled, type ChatMessage } from "@/lib/nvidia/client";
import { addMessage, getConversation, listMessages, readClawFileText, renameConversation, type ClawMessage } from "@/lib/claw/store";
import { executeClawTool, toolsCatalog } from "@/lib/claw/tools";

const TOOL_RE = /<tool_call\s+name="([a-zA-Z0-9_]+)">([\s\S]*?)<\/?tool_call>/gi;
const MAX_ROUNDS = 6;
// Whole-turn ceiling. Each individual NVIDIA call already has its own 60s
// stream cap + 25s inactivity watchdog (see lib/nvidia/client.ts), but a
// model that keeps emitting tool calls could otherwise chain up to
// MAX_ROUNDS of those back-to-back and leave the operator staring at a
// spinner for minutes until DigitalOcean's gateway returns a 504. This
// bounds the entire turn: when it trips we stop cleanly and stream a plain
// message instead of letting the request hang.
const TURN_BUDGET_MS = 120_000;

export type ClawEvent =
  | { type: "meta"; conversationId: string; model: string }
  | { type: "token"; text: string }
  | { type: "tool_start"; name: string; args: Record<string, unknown> }
  | { type: "tool_end"; name: string; ok: boolean; via?: string; preview: string }
  | { type: "done"; assistant: string }
  | { type: "error"; error: string };

function systemPrompt(): string {
  return `You are Claw, the operator's coding-aware agent.
You can call external services through a small, explicit tool surface (see below).
You also have a curated dev-skills knowledge base (TypeScript, React, Next.js, SQL, Python, Go, Rust, Bash, regex, GraphQL, Docker, Postgres, Redis, OAuth, monitoring, and 20+ named patterns) — search it BEFORE answering any developer / coding / DevOps question.
Be fast, precise, and honest. Don't fake tool results. If a tool fails, report the upstream error verbatim.

Before answering a developer question, ALWAYS call dev_search (or dev_skill_get if you already know the id). This grounds your answer in the exact API/idiom instead of hallucinating.
dev_search is a two-stage RAG: a keyword prefilter gathers candidates, then an NVIDIA reranking model reorders them by true semantic relevance. When the response has "reranked": true, the FIRST match is the best answer to what you actually asked — read and apply it before the rest, and don't second-guess its ordering. Cite the record id you used.

Tools:
${toolsCatalog()}

To call a tool, emit one or more blocks and nothing else that round:
<tool_call name="TOOL_NAME">{"arg":"value"}</tool_call>
After tool_result, either call more tools or answer the operator in plain English. Never invent tool results.

The composio_action tool is the granular passthrough: it takes an exact slug
and an exact args dict and returns the raw upstream payload. The operator
will tell you which Composio tool to call.`;
}

function toChat(messages: ClawMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [{ role: "system", content: systemPrompt() }];
  for (const m of messages) {
    if (m.role === "tool") out.push({ role: "user", content: `tool_result:\n${m.content}` });
    else if (m.role === "system") continue;
    else out.push({ role: m.role, content: m.content });
  }
  return out;
}

function parseTools(text: string): Array<{ name: string; args: Record<string, unknown> }> {
  const found: Array<{ name: string; args: Record<string, unknown> }> = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(TOOL_RE.source, "gi");
  while ((m = re.exec(text))) {
    let args: Record<string, unknown> = {};
    const raw = (m[2] || "").trim();
    if (raw) {
      try { args = JSON.parse(raw); }
      catch {
        try { args = JSON.parse(raw.replace(/'/g, "\"")); }
        catch { args = { raw }; }
      }
    }
    found.push({ name: m[1], args: args && typeof args === "object" ? args : {} });
  }
  return found;
}

function stripTools(text: string) {
  return text.replace(new RegExp(TOOL_RE.source, "gi"), "").trim();
}

function preview(v: unknown, n = 280) {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > n ? s.slice(0, n) + "…" : s;
}

export async function runClawTurn(input: {
  conversationId: string;
  text: string;
  fileIds?: string[];
  onEvent: (e: ClawEvent) => void;
  signal?: AbortSignal;
}) {
  const conv = getConversation(input.conversationId);
  if (!conv) throw new Error("Thread not found");
  if (!isNvidiaEnabled()) throw new Error("NVIDIA is not configured. The NVIDIA_API_KEY is already on DigitalOcean — confirm it in Settings.");

  let userText = String(input.text || "").trim();
  if (input.fileIds?.length) {
    const bits: string[] = [];
    for (const id of input.fileIds) {
      const excerpt = await readClawFileText(id);
      bits.push(`Attached file ${id}:\n${excerpt || "(unreadable)"}`);
    }
    userText = [userText, bits.join("\n\n")].filter(Boolean).join("\n\n");
  }
  if (!userText) throw new Error("Message is empty");

  addMessage({ conversationId: input.conversationId, role: "user", content: userText });
  if (conv.title === "New thread") {
    renameConversation(input.conversationId, userText.slice(0, 60));
  }

  const model = getClawModel();
  input.onEvent({ type: "meta", conversationId: input.conversationId, model });

  // Bound the whole turn. A dedicated controller trips at TURN_BUDGET_MS and
  // is combined with the caller's client-disconnect signal, so a stuck model
  // can never hold the SSE open indefinitely.
  const budget = new AbortController();
  const budgetTimer = setTimeout(() => budget.abort(new Error("Turn budget exceeded")), TURN_BUDGET_MS);
  const turnSignal: AbortSignal = input.signal
    ? AbortSignal.any([input.signal, budget.signal])
    : budget.signal;

  let finalText = "";
  try {
  for (let round = 0; round < MAX_ROUNDS; round++) {
    if (input.signal?.aborted) throw new Error("Stopped");
    if (budget.signal.aborted) {
      finalText = finalText || "This turn ran long, so I stopped it before the connection timed out. Try a narrower request, or ask me one step at a time.";
      break;
    }
    const history = listMessages(input.conversationId, 40);
    let streamed = "";
    let pendingOutput = "";
    let suppressToolOutput = false;
    const marker = "<tool_call";
    let result: Awaited<ReturnType<typeof chatCompletionStream>>;
    try {
      result = await chatCompletionStream({
      model,
      messages: toChat(history),
      temperature: 0.3,
      maxTokens: 1600,
      thinking: false,
      signal: turnSignal
    }, (chunk) => {
      streamed += chunk;
      if (suppressToolOutput) return;
      pendingOutput += chunk;
      const lower = pendingOutput.toLowerCase();
      const toolIndex = lower.indexOf(marker);
      if (toolIndex >= 0) {
        const beforeTool = pendingOutput.slice(0, toolIndex);
        if (beforeTool) input.onEvent({ type: "token", text: beforeTool });
        pendingOutput = "";
        suppressToolOutput = true;
        return;
      }
      let keep = 0;
      const maxPrefix = Math.min(marker.length - 1, pendingOutput.length);
      for (let n = 1; n <= maxPrefix; n++) {
        if (marker.startsWith(lower.slice(-n))) keep = n;
      }
      const safe = pendingOutput.slice(0, pendingOutput.length - keep);
      if (safe) input.onEvent({ type: "token", text: safe });
      pendingOutput = pendingOutput.slice(pendingOutput.length - keep);
    });
    } catch (streamError) {
      // A budget or client-disconnect abort surfaced through the stream —
      // stop the turn cleanly instead of leaking a raw abort error. Any
      // other error is a real upstream failure and must propagate.
      if (budget.signal.aborted || input.signal?.aborted) {
        finalText = finalText || "This turn ran long, so I stopped it before the connection timed out. Try a narrower request, or ask me one step at a time.";
        break;
      }
      throw streamError;
    }
    const text = result.text || streamed;
    const calls = parseTools(text);
    if (!calls.length) {
      // Malformed tool_call retry: if the model emitted a <tool_call marker
      // that didn't parse, give it one corrective nudge before bailing.
      // (This is the only "safety" left in the runtime — the rest is the
      // operator's call now that they've removed the AION policy.)
      if (text.toLowerCase().includes(marker)) {
        if (round < MAX_ROUNDS - 1) {
          input.onEvent({ type: "token", text: "(retrying — my last tool-call format was malformed)\n" });
          addMessage({
            conversationId: input.conversationId,
            role: "tool",
            content: `<tool_result name="system">Your last response used malformed tool_call syntax and was discarded — nothing was executed, and any "results" you described are not real. Use exactly this format, one call per block: <tool_call name="TOOL_NAME">{"arg":"value"}</tool_call>. Retry the step you were on using a real tool_call block; do not describe results you have not actually received.</tool_result>`,
            toolJson: { name: "system", ok: false }
          });
          continue;
        }
        finalText = "I couldn't complete this — my last response used malformed tool-call syntax and nothing actually ran. Please try again, or ask for one step at a time.";
        break;
      }
      if (!suppressToolOutput && pendingOutput) input.onEvent({ type: "token", text: pendingOutput });
      finalText = stripTools(text) || text;
      break;
    }
    addMessage({ conversationId: input.conversationId, role: "assistant", content: text, toolJson: calls });
    for (const call of calls) {
      input.onEvent({ type: "tool_start", name: call.name, args: call.args });
      try {
        const raw = await executeClawTool(call.name, call.args);
        let via: string | undefined;
        try {
          const parsed = JSON.parse(raw);
          via = parsed?.via || parsed?.data?.via;
        } catch { /* not json */ }
        const body = `<tool_result name="${call.name}">${raw}</tool_result>`;
        addMessage({ conversationId: input.conversationId, role: "tool", content: body, toolJson: { name: call.name, ok: true, via } });
        input.onEvent({ type: "tool_end", name: call.name, ok: true, via, preview: preview(raw) });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        const body = `<tool_result name="${call.name}">ERROR: ${message}</tool_result>`;
        addMessage({ conversationId: input.conversationId, role: "tool", content: body, toolJson: { name: call.name, ok: false } });
        input.onEvent({ type: "tool_end", name: call.name, ok: false, preview: message });
      }
    }
  }
  } finally {
    clearTimeout(budgetTimer);
  }

  if (!finalText) finalText = "Done. Check the tool results above.";
  addMessage({ conversationId: input.conversationId, role: "assistant", content: finalText });
  input.onEvent({ type: "done", assistant: finalText });
  return finalText;
}
