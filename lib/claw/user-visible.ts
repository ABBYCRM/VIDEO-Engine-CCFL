// User-visible Claw chat. Control-loop state stays on the runtime / Brain
// event bus. The operator transcript is natural language only.

const CONTROL_LINE = /^\s*(?:#{1,6}\s*)?(?:[-*]\s*)?(?:SELF[_-\s]?(?:OBSERVATION|MONITORING|STATE|REFLECTION)|INTROSPECTION|METACOGNITION|METACONTROL|TERMINATION[_-\s]?CHECK|free_energy\b|LOOP_DETECTED\b|execution_plan\b|execution_checkpoint\b|previous_tool_results\b|current_strategy\b|self_state\b|Status:\s*(?:verified checks|blocked\b|partially verified)|(?:PASS|NOT VERIFIED)\s*:|COMMIT\b|DEFER\b|Trinity:\s*(?:GO|HOLD|ABORT)|reasons:\s*\[)/i;

const CONTROL_TOKEN = /\b(?:SELF[_-]?OBSERVATION|SELF[_-]?MONITORING|SELF[_-]?REFLECTION|SELF[_-]?STATE|INTROSPECTION|METACOGNITION|METACONTROL|TERMINATION[_-]?CHECK|free_energy|LOOP_DETECTED|previous_tool_results|execution_checkpoint|current_strategy)\b/i;

const TOOL_XML = /<\/?(?:tool_call|tool_result)\b[^>]*>[\s\S]*?<\/(?:tool_call|tool_result)>/gi;
const TOOL_XML_OPEN = /<\/?(?:tool_call|tool_result)\b[^>]*>/gi;

const ACTIONABLE = /\b(build|implement|fix|repair|create|code|deploy|test|edit|make|continue|resume|search|scrape|research|look up|browse|fetch|osint|arxiv|gdy|preprint|rag|public records?|email|send|launch|spawn|cursor|open|click|find|download|post|schedule|write|update|run)\b/i;

const CONSULT_ONLY = /^(what do you think|explain|should i|advise|advice|opinion|consult|lattice|what would you|why is|how does)\b/i;

const INTERNAL_AION_SSE = new Set([
  "self_state", "self-state", "phase", "cycle", "cycles", "trinity",
  "decision", "lattice", "free_energy", "execution_plan", "observation",
  "monitor", "introspection", "metacognition", "reflection", "metacontrol",
  "termination", "control", "trace", "debug", "plan", "checkpoint",
  "tool_start", "tool_end", "tool-start", "tool-end"
]);

const STATE_KEYS = [
  "self_state", "free_energy", "execution_plan", "previous_tool_results",
  "current_strategy", "trinity", "cycles", "phase", "blockers", "health"
];

export function looksLikeInternalState(text: string): boolean {
  const value = String(text || "").trim();
  if (!value) return false;
  if (CONTROL_TOKEN.test(value) || CONTROL_LINE.test(value)) return true;
  if (/<tool_call\b|<tool_result\b/i.test(value)) return true;
  if (/^\s*Status:\s*(verified checks|blocked|partially verified)/i.test(value)) return true;
  if (isControlJson(value)) return true;
  return false;
}

export function isInternalAionSseType(type: unknown): boolean {
  return INTERNAL_AION_SSE.has(String(type || "").trim().toLowerCase());
}

export function filterAionSseDelta(text: string): string {
  return sanitizeUserVisibleMessage(text);
}

export function preferAionExecute(text: string): boolean {
  return ACTIONABLE.test(String(text || ""));
}

export function routeAionMode(text: string): "execute" | "consult" {
  const value = String(text || "").trim();
  if (!value) return "consult";
  if (preferAionExecute(value)) return "execute";
  if (CONSULT_ONLY.test(value)) return "consult";
  return "consult";
}

export function humanToolProgress(name: string): string {
  const tool = String(name || "").toLowerCase();
  if (tool === "aion_execute" || tool === "aion_consult") return "Working…";
  if (tool.includes("search") || tool === "gdy_rag_context" || tool === "arxiv_search") return "Searching…";
  if (tool.includes("scrape") || tool === "web_screenshot") return "Reading the page…";
  if (tool.startsWith("cursor_launch") || tool === "cursor_launch") return "Spawned Cursor agent…";
  if (tool.startsWith("cursor_")) return "Checking the Cursor agent…";
  if (tool.startsWith("computer_")) return "Using Computer…";
  if (tool.startsWith("forge_")) return "Running Forge…";
  if (tool.startsWith("swarm_")) return "Spawning a worker…";
  if (tool === "resend_send" || tool.includes("email") || tool.includes("gmail")) return "Sending mail…";
  if (tool.startsWith("composio_")) return "Calling the connected app…";
  if (tool === "execution_plan" || tool === "execution_verify" || tool === "execution_blocked") return "Working…";
  if (tool === "save_file" || tool === "read_file") return "Saving a file…";
  if (tool === "steel_scrape") return "Reading the page…";
  return "Working…";
}

export function sanitizeUserVisibleMessage(text: string): string {
  let value = String(text || "");
  if (!value.trim()) return "";
  value = value.replace(TOOL_XML, "").replace(TOOL_XML_OPEN, "");
  value = stripFencedControlBlocks(value);
  value = stripInlineControlJson(value);
  const kept: string[] = [];
  for (const line of value.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (kept.length && kept[kept.length - 1] !== "") kept.push("");
      continue;
    }
    if (CONTROL_LINE.test(trimmed)) continue;
    if (isControlJson(trimmed)) continue;
    if (/^\s*[-*]\s*(PASS|NOT VERIFIED)\s*:/i.test(trimmed)) continue;
    if (/^\s*(COMMIT|DEFER)\s*$/i.test(trimmed)) continue;
    kept.push(line.replace(/\s+$/, ""));
  }
  let out = kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (isControlJson(out)) return "";
  if (out && looksLikeMostlyControl(out)) return "";
  return out;
}

export function toUserVisibleAssistant(text: string, opts?: { fallback?: string }): string {
  const cleaned = sanitizeUserVisibleMessage(text);
  if (cleaned) return cleaned;
  return (opts?.fallback || "").trim();
}

export function isTranscriptAssistantContent(text: string): boolean {
  return Boolean(sanitizeUserVisibleMessage(text));
}

function looksLikeMostlyControl(text: string): boolean {
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return true;
  const bad = lines.filter((line) => CONTROL_TOKEN.test(line) || CONTROL_LINE.test(line) || isControlJson(line));
  return bad.length >= Math.ceil(lines.length * 0.6);
}

function isControlJson(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return false;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
    return STATE_KEYS.some((key) => Object.prototype.hasOwnProperty.call(parsed, key))
      || ("instruction" in parsed && "execution" in parsed)
      || ("goal" in parsed && "steps" in parsed && "checks" in parsed);
  } catch {
    return false;
  }
}

function stripFencedControlBlocks(text: string): string {
  return text.replace(/```(?:json|js|ts)?\s*([\s\S]*?)```/gi, (_all, body: string) => {
    const inner = String(body || "").trim();
    return isControlJson(inner) || looksLikeInternalState(inner) ? "" : _all;
  });
}

function stripInlineControlJson(text: string): string {
  return text.replace(/\{[^{}]*"(?:self_state|free_energy|execution_plan|previous_tool_results|current_strategy|trinity|cycles)"[^{}]*\}/g, "");
}
