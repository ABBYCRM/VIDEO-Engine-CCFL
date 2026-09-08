import { chatCompletionStream, getClawModel, isNvidiaEnabled, type ChatMessage } from "@/lib/nvidia/client";
import { addMessage, getConversation, listMessages, readClawFileText, renameConversation, type ClawMessage } from "@/lib/claw/store";
import { executeClawTool, toolsAsOpenAI, toolsCatalog, CLAW_TOOL_NAMES } from "@/lib/claw/tools";
import { aionAcceptanceForGoal, aionExecute, isAionConfigured, isToolfulGoal } from "@/lib/claw/aion";
import { Execution, parseToolCalls, awaitWithSignal, type ParsedToolCall } from "./execution";
import { SelfStateController, createSelfState, type PublicSelfState } from "./self-state";

const MAX_ROUNDS = 18;
const TURN_BUDGET_MS = 120_000;
const MAX_CONTINUATIONS = 3;

export type ClawEvent =
  | { type: "meta"; conversationId: string; model: string }
  | { type: "token"; text: string }
  | { type: "tool_start"; name: string; args: Record<string, unknown> }
  | { type: "tool_end"; name: string; ok: boolean; via?: string; preview: string }
  | { type: "self_state"; health: string; issue: string; phase: string; progress: number; strategy: string; blockers: string[]; step: string; toolsRun: number }
  | { type: "done"; assistant: string }
  | { type: "error"; error: string };

function systemPrompt(): string {
  return `You are Claw, the operator's coding-aware agent.
You operate inside an AGENTIC SELF-STATE CONTROL LOOP. The runtime — not your prose — decides when work is complete.

Each cycle the runtime runs: SELF-OBSERVATION → SELF-MONITORING → INTROSPECTION → METACOGNITION → SELF-REFLECTION → METACONTROL → ACTION → TERMINATION CHECK.
SELF_STATE tracks your goal, plan, steps, memory, assumptions, facts, unknowns, strategy, tools, prior tool results, errors, blockers, budget, progress, and confidence.

Hard rules:
- Never treat assumptions as facts, intended tool actions as completed, missing information as negative evidence, or confidence as proof.
- Epistemic labels are KNOWN / INFERRED / ASSUMED / UNKNOWN / CONTRADICTED.
- Identical strategy ≥2 failures with no new evidence is LOOP_DETECTED: do not retry that action. Take a materially different action (different tool, different arguments, aion_execute, aion_consult, or execution_blocked).
- COMPLETE is refused unless acceptance criteria are verified against recorded tool evidence.
- Do not emit a plan instead of a tool call. If you need a tool, call it this turn.

You can call external services through the tool surface. You also have a curated dev-skills knowledge base — use it when relevant; retrieval is not implementation or verification.
Be precise and honest. Don't fake tool results. If a tool fails, report the upstream error verbatim.

When developer reference material is needed, call dev_search (or dev_skill_get if you already know the id).
dev_search is a two-stage RAG: keyword prefilter then NVIDIA rerank. When "reranked": true, the FIRST match is the best.

Execution contract:
For requests to build, fix, create, edit, deploy, or test, call execution_plan BEFORE taking action.
Observe -> Plan -> Act -> Verify -> Compare -> Correct -> Repeat.
Write deliverables with save_file or an available coding tool, one complete file at a time.
save_file stores artifacts only; it is not a shell. Discover execution tools through Composio or e2b_run.
Tool results have runtime evidence IDs. Use execution_verify only against actual current evidence.
Exhausted budget, missing tools, interrupted output or absent evidence means blocked/partial, never Done.

Aion-Brain is the connected brain. Prefer aion_execute for work that must use brain tools (search, scrape, n8n, live research). Keep aion_status / aion_consult / aion_n8n as advice. Treat previous_tool_results as the only Aion evidence. Never mark local work verified from Aion prose or complete=true.

Runtime tools:
<tool_call name="execution_plan">{"goal":"user goal","steps":["observe","implement","test"],"checks":[{"id":"build","description":"Production build exits successfully","kind":"command"},{"id":"files","description":"Deliverable saved","kind":"artifact"}]}</tool_call>
<tool_call name="execution_verify">{"check":"build","evidence":"e3","path":"data.exit_code"}</tool_call>
<tool_call name="execution_blocked">{"reason":"exact missing capability or unresolved failure"}</tool_call>

Tools:
${toolsCatalog()}

Preferred: use native function/tool calling when the API offers it.
Fallback: emit one or more XML blocks and nothing else that round:
<tool_call name="TOOL_NAME">{"arg":"value"}</tool_call>
After tool_result, either call more tools or answer the operator in plain English. Never invent tool results.`;
}

function toChat(messages: ClawMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [{ role: "system", content: systemPrompt() }];
  for (const m of messages) {
    if (m.role === "tool") {
      const meta = m.toolJson && typeof m.toolJson === "object" ? m.toolJson as { name?: string; tool_call_id?: string } : {};
      if (meta.tool_call_id) {
        out.push({ role: "tool", content: m.content, name: meta.name, tool_call_id: meta.tool_call_id });
      } else {
        out.push({ role: "user", content: `tool_result:\n${m.content}` });
      }
    } else if (m.role === "assistant") {
      const meta = m.toolJson && typeof m.toolJson === "object" ? m.toolJson as {
        tool_calls?: ChatMessage["tool_calls"];
        reasoning_content?: string;
      } : {};
      out.push({
        role: "assistant",
        content: m.content || (meta.tool_calls?.length ? null : ""),
        tool_calls: meta.tool_calls,
        reasoning_content: meta.reasoning_content
      });
    } else if (m.role === "system") continue;
    else out.push({ role: m.role, content: m.content });
  }
  return out;
}

function serializeToolResult(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value) ?? "null";
}

function preview(s: string, n = 280) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function actionFingerprint(name: string, args: Record<string, unknown>): string {
  try { return `${name}:${JSON.stringify(args)}`; }
  catch { return name; }
}

function emitSelf(onEvent: (e: ClawEvent) => void, snap: PublicSelfState, phase = snap.phase) {
  onEvent({
    type: "self_state",
    health: snap.health,
    issue: snap.issue,
    phase,
    progress: snap.progress,
    strategy: snap.strategy,
    blockers: snap.blockers,
    step: snap.step,
    toolsRun: snap.toolsRun
  });
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

  const budget = new AbortController();
  const budgetTimer = setTimeout(() => budget.abort(new Error("Turn budget exceeded")), TURN_BUDGET_MS);
  const turnSignal: AbortSignal = input.signal
    ? AbortSignal.any([input.signal, budget.signal])
    : budget.signal;

  const codingWork = /\b(build|implement|fix|repair|create|code|make)\b/i.test(input.text) && /\b(app|code|software|website|scheduler|typescript|javascript|python|backend|frontend|repository|repo)\b/i.test(input.text);
  const needsCommandProof = /\b(deploy|pytest|unit test|ci\/cd|production build)\b/i.test(input.text);
  const execution = new Execution(codingWork ? (needsCommandProof ? ["artifact", "command"] : ["artifact"]) : []);
  const requiresPlan = /\b(build|implement|fix|repair|create|code|deploy|test|edit|make|continue|resume)\b/i.test(input.text);
  if (/^\s*(continue|resume)\b/i.test(input.text)) {
    const previous = [...listMessages(input.conversationId, 60)].reverse().find(m => m.toolJson && typeof m.toolJson === "object" && (m.toolJson as { name?: string }).name === "execution_checkpoint");
    const saved = (previous?.toolJson as { execution?: { goal?: string; steps?: string[]; checks?: unknown[] } } | undefined)?.execution;
    if (saved?.goal && saved.steps && saved.checks?.length) {
      execution.plan({ goal: saved.goal, steps: saved.steps, checks: saved.checks });
    }
  }

  const self = new SelfStateController(
    createSelfState({
      goal: userText,
      tools: [...CLAW_TOOL_NAMES, "execution_plan", "execution_verify", "execution_blocked"],
      maxRounds: MAX_ROUNDS,
      budgetMs: TURN_BUDGET_MS
    }),
    { maxRounds: MAX_ROUNDS, budgetMs: TURN_BUDGET_MS }
  );
  if (execution.goal) self.setPlan(execution.steps, "act");

  const toolful = isToolfulGoal(userText) || requiresPlan;
  if (isAionConfigured() && toolful) {
    input.onEvent({ type: "tool_start", name: "aion_execute", args: { goal: userText.slice(0, 400) } });
    try {
      const ran = await aionExecute({
        goal: userText,
        acceptance: aionAcceptanceForGoal(userText),
        sessionId: `claw:${input.conversationId}`,
        maxCycles: 8
      }, { conversationId: input.conversationId, signal: turnSignal, selfState: self.compactPrompt() });
      self.ingestAionResults(ran.previous_tool_results);
      self.remember(`Aion execute status=${ran.status}. previous_tool_results are the only Aion evidence; complete=${ran.complete} is not local verification.`);
      addMessage({
        conversationId: input.conversationId,
        role: "tool",
        content: `<tool_result name="aion_execute">${JSON.stringify({
          ok: ran.ok, status: ran.status, complete: ran.complete, verified: ran.verified,
          answer: ran.answer.slice(0, 2000), previous_tool_results: ran.previous_tool_results,
          note: "Do not mark Claw execution verified from Aion prose."
        })}</tool_result>`,
        toolJson: { name: "aion_execute", ok: ran.ok && ran.status !== "BLOCKED" }
      });
      input.onEvent({ type: "tool_end", name: "aion_execute", ok: ran.ok && ran.status !== "BLOCKED", preview: preview(JSON.stringify({ status: ran.status, tools: ran.previous_tool_results.length })) });
      emitSelf(input.onEvent, self.publicSnapshot(), "ACTION");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      self.recordTool({ name: "aion_execute", ok: false, preview: message, strategy: "aion-execute" });
      addMessage({ conversationId: input.conversationId, role: "tool", content: `<tool_result name="aion_execute">ERROR: ${message}</tool_result>`, toolJson: { name: "aion_execute", ok: false } });
      input.onEvent({ type: "tool_end", name: "aion_execute", ok: false, preview: message });
    }
  }

  let finalText = "";
  let continuation = "";
  let continuations = 0;
  let correctionCount = 0;
  const checkpoint = (message: string) => addMessage({
    conversationId: input.conversationId, role: "tool",
    content: JSON.stringify({ instruction: message, execution: execution.snapshot(), self_state: self.publicSnapshot() }),
    toolJson: { name: "execution_checkpoint", execution: execution.snapshot() }
  });
  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      if (turnSignal.aborted) {
        finalText = execution.report(input.signal?.aborted ? "Stopped by operator. Saved files and checkpoints are retained." : "Turn time budget reached. Saved files and checkpoints are retained; remaining checks were not completed. An interrupted external operation may still be running; inspect it before retrying.");
        break;
      }

      const cycle = self.cycle({ round });
      emitSelf(input.onEvent, cycle.public, "ACTION");

      const history = listMessages(input.conversationId, 60);
      const messages = toChat(history);
      messages.push({
        role: "system",
        content: `SELF_STATE: ${self.compactPrompt()}. Current execution checkpoint: ${JSON.stringify(execution.snapshot())}. ${requiresPlan && !execution.goal ? "This is a work request: execution_plan is required before any action or final claim." : ""} ${cycle.instruction}`
      });
      if (continuation) {
        messages.push({ role: "assistant", content: continuation });
        messages.push({ role: "user", content: "The previous output was interrupted. Continue exactly where it stopped without repeating it. If it ends inside a tool_call, finish that same block. Nothing from the incomplete response has been executed." });
      }
      let streamed = "";
      let result: Awaited<ReturnType<typeof chatCompletionStream>>;
      try {
        result = await chatCompletionStream({
          model,
          messages,
          temperature: 0.3,
          maxTokens: 6400,
          thinking: true,
          tools: toolsAsOpenAI(),
          toolChoice: cycle.forceTool && (requiresPlan || cycle.health === "LOOP_DETECTED" || cycle.issue === "EXECUTION_FAILURE") ? "required" : "auto",
          signal: turnSignal
        }, chunk => { streamed += chunk; });
      } catch (error) {
        checkpoint(`Provider interrupted: ${error instanceof Error ? error.message : String(error)}. No incomplete tool calls executed.`);
        self.state.errors = [...self.state.errors, "provider interrupted"];
        finalText = execution.report("Provider request stopped or failed. Work remains unverified; inspect the saved checkpoint before continuing.");
        break;
      }
      const text = continuation + (result.text || streamed);
      const nativeCalls = result.toolCalls || [];
      if (!["stop", "tool_calls"].includes(result.finishReason)) {
        continuation = text;
        checkpoint(`Provider finish reason: ${result.finishReason}. Response incomplete; no actions from it executed.`);
        if (++continuations <= MAX_CONTINUATIONS && text.length < 120_000 && ["length", "interrupted"].includes(result.finishReason)) {
          input.onEvent({ type: "token", text: "Response interrupted; continuing before executing or marking it complete.\n" });
          continue;
        }
        addMessage({ conversationId: input.conversationId, role: "assistant", content: `Unfinished draft (not executed or verified):\n${text}` });
        finalText = execution.report(`Generation did not complete (${result.finishReason}); continuation limit reached.`);
        break;
      }
      continuation = "";
      let calls: ParsedToolCall[];
      try { calls = parseToolCalls(text, nativeCalls); }
      catch (error) {
        self.recordStrategyFailure(self.state.current_strategy, "malformed-tool-call");
        checkpoint(String(error));
        continue;
      }
      if (!calls.length) {
        self.observeModelText(text);
        const gate = self.terminationCheck({
          wantsComplete: true,
          acceptanceVerified: execution.verified,
          requiresAcceptance: Boolean(requiresPlan || execution.goal),
          hasPendingToolIntent: self.state.available_tools.some((name) => text.includes(name) && /i will|let me|going to|call /i.test(text))
        });
        if (!gate.complete) {
          self.recordStrategyFailure(self.state.current_strategy, `text:${text.slice(0, 120)}`);
          if (++correctionCount <= 2) {
            checkpoint(`${gate.reason} ${cycle.health === "LOOP_DETECTED" ? cycle.instruction : "Observe the remaining gap, implement/correct using tools, then verify. If no useful action is possible, call execution_blocked."}`);
            emitSelf(input.onEvent, self.publicSnapshot(), "TERMINATION_CHECK");
            continue;
          }
          finalText = execution.report(gate.reason || "The model attempted to finish without the required evidence. Work is not confirmed complete.");
        } else {
          finalText = execution.goal ? `${execution.report("Acceptance checks passed against recorded tool evidence.")}\n\n${text}` : text;
        }
        break;
      }
      addMessage({
        conversationId: input.conversationId,
        role: "assistant",
        content: text || "",
        toolJson: {
          calls,
          tool_calls: nativeCalls.length ? nativeCalls : calls.map((c, i) => ({
            id: c.id || `call_${i + 1}`,
            type: "function",
            function: { name: c.name, arguments: JSON.stringify(c.args) }
          })),
          reasoning_content: result.reasoningContent || undefined
        }
      });
      for (const call of calls) {
        if (turnSignal.aborted) break;
        const action = actionFingerprint(call.name, call.args);
        if (cycle.requireDifferentAction && self.isForbidden(self.state.current_strategy, action)) {
          const message = `LOOP_DETECTED: retry of ${call.name} with the same arguments is forbidden. Choose a materially different action.`;
          self.state.blockers = [...self.state.blockers, message];
          addMessage({ conversationId: input.conversationId, role: "tool", content: `<tool_result name="${call.name}">ERROR: ${message}</tool_result>`, toolJson: { name: call.name, ok: false, tool_call_id: call.id } });
          input.onEvent({ type: "tool_end", name: call.name, ok: false, preview: message });
          self.recordTool({ name: call.name, ok: false, preview: message });
          continue;
        }
        input.onEvent({ type: "tool_start", name: call.name, args: call.args });
        self.state.tool_status[call.name] = "running";
        emitSelf(input.onEvent, self.publicSnapshot(), "ACTION");
        try {
          let value: unknown;
          if (call.name === "execution_plan") {
            value = execution.plan(call.args);
            self.setPlan(execution.steps, execution.steps[0] || "act");
            self.setExpected(execution.goal);
          } else if (call.name === "execution_verify") {
            value = execution.verify(call.args);
          } else if (call.name === "execution_blocked") {
            if (typeof call.args.reason !== "string" || !call.args.reason.trim()) throw new Error("Provide an exact blocker.");
            self.state.blockers = [...self.state.blockers, call.args.reason];
            finalText = execution.report(`Blocker reported by model: ${call.args.reason}`);
            value = { ok: false, blocked: true, reason: call.args.reason };
          } else {
            if (requiresPlan && !execution.goal) {
              try { execution.ensureDefaultPlan(userText); } catch { /* allow the tool */ }
            }
            execution.begin(call.name);
            const resultValue = await awaitWithSignal(executeClawTool(call.name, call.args, {
              conversationId: input.conversationId,
              signal: turnSignal,
              selfState: self.compactPrompt()
            }), turnSignal);
            const evidence = execution.record(call.name, resultValue);
            value = { evidenceId: evidence.id, revision: evidence.revision, ok: evidence.ok, result: resultValue };
          }
          const raw = serializeToolResult(value);
          const ok = !(value && typeof value === "object" && (value as { ok?: boolean }).ok === false);
          const via = (() => {
            if (!value || typeof value !== "object") return undefined;
            const row = value as { via?: unknown; result?: { via?: unknown } };
            if (typeof row.via === "string") return row.via;
            if (typeof row.result?.via === "string") return row.result.via;
            return undefined;
          })();
          addMessage({
            conversationId: input.conversationId,
            role: "tool",
            content: `<tool_result name="${call.name}">${raw}</tool_result>`,
            toolJson: { name: call.name, ok, tool_call_id: call.id || (nativeCalls.find((n) => n.function.name === call.name)?.id) }
          });
          self.recordTool({ name: call.name, ok, preview: preview(raw), evidenceId: value && typeof value === "object" ? (value as { evidenceId?: string }).evidenceId : undefined, strategy: self.state.current_strategy });
          input.onEvent({ type: "tool_end", name: call.name, ok, via, preview: preview(raw) });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          addMessage({ conversationId: input.conversationId, role: "tool", content: `<tool_result name="${call.name}">ERROR: ${message}</tool_result>`, toolJson: { name: call.name, ok: false, tool_call_id: call.id } });
          self.recordTool({ name: call.name, ok: false, preview: message, strategy: self.state.current_strategy });
          input.onEvent({ type: "tool_end", name: call.name, ok: false, preview: message });
        }
        if (finalText) break;
      }
      checkpoint("Compare current evidence with acceptance checks. Correct failures before finishing.");
      emitSelf(input.onEvent, self.publicSnapshot(), "TERMINATION_CHECK");
      if (finalText) break;
    }
  } finally {
    clearTimeout(budgetTimer);
  }
  if (!finalText) {
    const gate = self.terminationCheck({
      wantsComplete: true,
      acceptanceVerified: execution.verified,
      requiresAcceptance: Boolean(requiresPlan || execution.goal),
      hasPendingToolIntent: false
    });
    finalText = execution.report(gate.complete ? gate.reason : "Execution round limit reached. Remaining work is unverified; checkpoints and saved files are retained.");
  }
  if (continuation && !finalText.includes("Generation did not complete")) {
    addMessage({ conversationId: input.conversationId, role: "assistant", content: `Unfinished draft (not executed or verified):\n${continuation}` });
  }
  addMessage({ conversationId: input.conversationId, role: "assistant", content: finalText });
  input.onEvent({ type: "done", assistant: finalText });
  return finalText;
}
