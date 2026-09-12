// Server-side Aion-Brain bridge. Credentials and destination never come from tool arguments.
// Endpoint shapes match docs/claw-contract.md on Aion-Brain main (0613977). Do not invent fields.
import { PRIMARY_CLAW_NVIDIA_MODEL } from "../nvidia/models.ts";
export type AionContext = { conversationId?: string; signal?: AbortSignal; selfState?: string; agentic?: boolean };

export type AionAcceptance = { id: string; description: string; tool?: string };

export type AionToolResult = {
  name: string;
  ok: boolean;
  preview?: string;
  evidence_id?: string;
};

export type AionExecuteInput = {
  goal: string;
  acceptance?: AionAcceptance[];
  sessionId?: string;
  maxCycles?: number;
};

export type AionExecuteResult = {
  ok: boolean;
  source: "aion-brain";
  status: "COMPLETE" | "INCOMPLETE" | "BLOCKED" | string;
  complete: boolean;
  verified: boolean;
  answer: string;
  session_id: string;
  self_state: { previous_tool_results: AionToolResult[]; health?: string; progress?: number };
  cycles: Array<{ health?: string; issues?: unknown; action?: { kind?: string; tool?: string; ok?: boolean } }>;
  previous_tool_results: AionToolResult[];
};

export async function aionN8n(action: unknown, args: unknown, context: AionContext = {}) {
  if (!["n8n_status", "n8n_tools", "n8n_workflows", "n8n_call", "n8n_aura"].includes(String(action))) throw new Error("Unknown n8n action.");
  const response = await request(`/api/tools/${action}`, context, args ?? {});
  return response.json();
}

function config() {
  const base = process.env.AION_BASE_URL?.trim();
  const key = process.env.AION_API_KEY?.trim();
  if (!base || !key) throw new Error("Aion-Brain is not configured. Run bash scripts/setup-aion-local.sh or set AION_BASE_URL and AION_API_KEY on the server.");
  const url = new URL(base);
  const local = ["localhost", "127.0.0.1", "[::1]", "aion-brain"].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
      (url.protocol !== "https:" && !(url.protocol === "http:" && local))) {
    throw new Error("AION_BASE_URL must be an HTTPS origin (HTTP is allowed for the local Aion service).");
  }
  return { origin: url.origin, key };
}

export function isAionConfigured(): boolean {
  try { config(); return true; } catch { return false; }
}

async function request(path: string, context: AionContext, body?: unknown, timeoutMs?: number) {
  const { origin, key } = config();
  const timeout = AbortSignal.timeout(timeoutMs ?? (body ? 120_000 : 10_000));
  const signal = context.signal ? AbortSignal.any([context.signal, timeout]) : timeout;
  const response = await fetch(origin + path, {
    method: body ? "POST" : "GET",
    headers: { "X-AION-Key": key, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "error", cache: "no-store", signal
  });
  if (!response.ok) {
    await response.body?.cancel();
    // Do not expose an upstream body that might contain credentials or private state.
    throw new Error(`Aion-Brain returned HTTP ${response.status}${response.status === 401 || response.status === 403 ? " (check the server's AION_API_KEY)" : ""}.`);
  }
  return response;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function booleanMap(value: unknown): Record<string, boolean> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const out: Record<string, boolean> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === "boolean") out[key] = item;
  }
  return out;
}

export function sanitizeAionToolResults(raw: unknown): AionToolResult[] {
  if (!Array.isArray(raw)) return [];
  const out: AionToolResult[] = [];
  for (const item of raw.slice(0, 40)) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const name = asString(row.tool) || asString(row.name) || "unknown";
    const evidence = asString(row.evidence_id) || asString(row.id);
    const preview = asString(row.preview);
    out.push({
      name,
      ok: row.ok === true,
      ...(preview ? { preview: preview.slice(0, 400) } : {}),
      ...(evidence ? { evidence_id: evidence } : {})
    });
  }
  return out;
}

export function aionAcceptanceForGoal(goal: string): AionAcceptance[] {
  const text = goal.toLowerCase();
  if (/\b(search|research|look up|rag|public records?|urls?)\b/.test(text)) {
    return [{ id: "search", description: "live search ran", tool: "web_search" }];
  }
  if (/\b(scrape|browse)\b/.test(text) || /https?:\/\//i.test(goal)) {
    return [{ id: "scrape", description: "live page scrape ran", tool: "steel_browser" }];
  }
  return [];
}

export function isToolfulGoal(text: string): boolean {
  return /\b(build|implement|fix|repair|create|code|deploy|test|edit|make|continue|resume|search|scrape|research|look up|browse|fetch|osint|arxiv|gdy|preprint|rag|public records?)\b/i.test(text);
}

export async function aionStatus(context: AionContext = {}) {
  const response = await request("/api/state", context);
  const state = await response.json();
  if (state.ok !== true || state.app !== "aion-brain") throw new Error("The configured server did not identify itself as Aion-Brain.");
  // Whitelist service health, not global active state or another session's context.
  const loop = state.control_loop && typeof state.control_loop === "object" ? state.control_loop as Record<string, unknown> : undefined;
  return {
    ok: true, connected: true, app: state.app, version: state.version,
    primaryModel: state.primary_model,
    agentModel: asString(state.agent_model),
    providers: state.providers,
    echoOnly: Array.isArray(state.providers) && state.providers.every((p: string) => p === "echo"),
    controlLoop: loop ? {
      phases: Array.isArray(loop.phases) ? loop.phases.filter((p): p is string => typeof p === "string") : undefined,
      toolsConfigured: booleanMap(loop.tools_configured),
      composioKeyType: asString(loop.composio_key_type)
    } : undefined
  };
}

export async function aionCurriculum(topics: unknown, format: unknown = "markdown", context: AionContext = {}) {
  if (!context.conversationId) throw new Error("Aion curriculum requires a Claw conversation.");
  if (topics !== undefined && (!Array.isArray(topics) || topics.length < 1 || topics.length > 42 || topics.some(t => typeof t !== "string" || t.length > 100))) {
    throw new Error("topics must be an array of 1–42 topic names, or omitted for all topics.");
  }
  if (format !== "markdown" && format !== "json") throw new Error("format must be markdown or json.");
  const response = await request("/api/sqm", context, { topics, format });
  if (!response.body) throw new Error("Aion-Brain returned no curriculum.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 16_000_000) throw new Error("Curriculum exceeded 16 MB. Request fewer topics.");
      chunks.push(part.value);
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const bytes = Buffer.concat(chunks);
  if (!bytes.length) throw new Error("Aion-Brain returned an empty curriculum.");
  if (format === "json") {
    const document = JSON.parse(bytes.toString("utf8"));
    if (!Array.isArray(document.sections)) throw new Error("Aion-Brain returned an invalid curriculum.");
  } else if (!bytes.toString("utf8").startsWith("# Comprehensive Software & Technology SQM")) {
    throw new Error("Aion-Brain returned an invalid curriculum.");
  }
  return { bytes, name: format === "json" ? "aion-curriculum.json" : "aion-curriculum.md",
    mime: format === "json" ? "application/json" : "text/markdown" };
}

export async function aionConsult(prompt: string, context: AionContext = {}) {
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 24_000) throw new Error("Aion prompt must contain 1–24,000 characters.");
  if (!context.conversationId) throw new Error("Aion consultation requires a Claw conversation.");
  const content = context.selfState
    ? `Claw SELF_STATE (no secrets; assumptions are not facts):\n${context.selfState}\n\n${prompt.trim()}`
    : prompt.trim();
  const response = await request("/api/chat", context, {
    messages: [{ role: "user", content }],
    session_id: `claw:${context.conversationId}`, max_tokens: 2048, skills: false,
    ...(context.agentic === true ? { agentic: true } : {})
  });
  if (!response.headers.get("content-type")?.includes("text/event-stream") || !response.body) {
    await response.body?.cancel();
    throw new Error("Aion-Brain did not return a chat event stream.");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "", answer = "", total = 0;
  let done: Record<string, unknown> | undefined;
  let decision: unknown, lattice: unknown;
  const consume = (frame: string) => {
    const data = frame.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
    if (!data || data === "[DONE]") return;
    const event = JSON.parse(data);
    if (event.type === "delta" && typeof event.text === "string") answer += event.text;
    if (event.type === "done") done = event;
    if (event.type === "decision") decision = event.decision;
    if (event.type === "lattice") lattice = { consensus: event.consensus, rationale: event.rationale };
    // An error can be followed by a successful provider fallback. Require a done event below.
  };
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > 1_000_000) throw new Error("Aion-Brain response exceeded the size limit.");
      buffer += decoder.decode(part.value, { stream: true });
      let boundary: RegExpExecArray | null;
      while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
        consume(buffer.slice(0, boundary.index));
        buffer = buffer.slice(boundary.index + boundary[0].length);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) consume(buffer);
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  if (!done || !answer.trim()) throw new Error("Aion-Brain did not complete an answer. Check its provider configuration and logs.");
  return { ok: true, source: "aion-brain", answer, provider: done.provider, model: done.model,
    echoOnly: done.provider === "echo", decision, lattice };
}

function sanitizeCycles(raw: unknown): AionExecuteResult["cycles"] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 24).map((item) => {
    if (!item || typeof item !== "object") return {};
    const row = item as Record<string, unknown>;
    const action = row.action && typeof row.action === "object" ? row.action as Record<string, unknown> : undefined;
    return {
      health: asString(row.health),
      issues: Array.isArray(row.issues) ? row.issues.slice(0, 8) : undefined,
      action: action ? {
        kind: asString(action.kind),
        tool: asString(action.tool),
        ok: action.ok === true
      } : undefined
    };
  });
}

export async function aionExecute(input: AionExecuteInput, context: AionContext = {}): Promise<AionExecuteResult> {
  const goal = input.goal.trim();
  if (!goal || goal.length > 24_000) throw new Error("Aion execute goal must contain 1–24,000 characters.");
  if (!context.conversationId && !input.sessionId) throw new Error("Aion execute requires a Claw conversation.");
  const acceptance = Array.isArray(input.acceptance)
    ? input.acceptance.filter((item) => item && typeof item.id === "string" && typeof item.description === "string").slice(0, 20)
    : [];
  const session_id = input.sessionId || `claw:${context.conversationId}`;
  const max_cycles = Number.isFinite(input.maxCycles) ? Math.min(24, Math.max(1, Number(input.maxCycles))) : 8;
  const response = await request("/api/claw/execute", context, {
    goal,
    ...(acceptance.length ? { acceptance } : {}),
    session_id,
    max_cycles,
    model: PRIMARY_CLAW_NVIDIA_MODEL,
    stream: false
  }, 180_000);
  const body = await response.json() as Record<string, unknown>;
  if (body.ok !== true || body.source !== "aion-brain") throw new Error("Aion-Brain did not return an execute payload.");
  const selfState = body.self_state && typeof body.self_state === "object" ? body.self_state as Record<string, unknown> : {};
  const previous = sanitizeAionToolResults(body.previous_tool_results ?? selfState.previous_tool_results);
  const status = asString(body.status) || "INCOMPLETE";
  return {
    ok: true,
    source: "aion-brain",
    status,
    complete: body.complete === true,
    verified: body.verified === true,
    answer: typeof body.answer === "string" ? body.answer : "",
    session_id: asString(body.session_id) || session_id,
    self_state: {
      previous_tool_results: sanitizeAionToolResults(selfState.previous_tool_results) || previous,
      health: asString(selfState.health),
      progress: typeof selfState.progress === "number" ? selfState.progress : 0
    },
    cycles: sanitizeCycles(body.cycles),
    previous_tool_results: previous
  };
}

export async function aionContract(context: AionContext = {}) {
  const response = await request("/api/claw/contract", context);
  const body = await response.json() as Record<string, unknown>;
  if (body.ok !== true) throw new Error("Aion-Brain did not return a claw contract.");
  const contract = body.contract && typeof body.contract === "object" ? body.contract as Record<string, unknown> : {};
  return {
    ok: true,
    source: "aion-brain",
    version: asString(contract.version),
    phases: Array.isArray(contract.phases) ? contract.phases.filter((p): p is string => typeof p === "string") : undefined,
    endpoints: contract.endpoints && typeof contract.endpoints === "object" ? contract.endpoints : undefined,
    execute_body: contract.execute_body && typeof contract.execute_body === "object" ? contract.execute_body : undefined,
    health: Array.isArray(contract.health) ? contract.health.filter((p): p is string => typeof p === "string") : undefined,
    epistemic: Array.isArray(contract.epistemic) ? contract.epistemic.filter((p): p is string => typeof p === "string") : undefined,
    completion: asString(contract.completion),
    anti_loop: asString(contract.anti_loop),
    self_state_fields: Array.isArray(contract.self_state_fields) ? contract.self_state_fields.filter((p): p is string => typeof p === "string") : undefined
  };
}

export async function aionTools(context: AionContext = {}) {
  const response = await request("/api/claw/tools", context);
  const body = await response.json() as Record<string, unknown>;
  if (body.ok !== true) throw new Error("Aion-Brain did not return a tool catalog.");
  const tools: Array<{ name: string; description?: string }> = [];
  if (Array.isArray(body.tools)) {
    for (const item of body.tools.slice(0, 200)) {
      if (!item || typeof item !== "object") continue;
      const name = asString((item as Record<string, unknown>).name);
      if (!name) continue;
      const description = asString((item as Record<string, unknown>).description);
      tools.push(description ? { name, description } : { name });
    }
  }
  return { ok: true, source: "aion-brain", count: typeof body.count === "number" ? body.count : tools.length, tools };
}

export async function aionTool(name: unknown, args: unknown, context: AionContext = {}) {
  const tool = String(name || "").trim();
  if (!/^[a-zA-Z0-9_]+$/.test(tool)) throw new Error("Aion tool name must be a single identifier.");
  const response = await request(`/api/claw/tools/${tool}`, context, args && typeof args === "object" ? args : {});
  return response.json();
}

/** Cursor Cloud Agents — Brain owns lib/cursor_cloud.js. CCFL only forwards. */
export type AionCursorResult = {
  ok: boolean;
  source: "aion-brain" | "ccfl-proxy";
  owner: "aion-brain";
  trinity: "GO" | "HOLD" | "ABORT";
  tool?: string;
  error?: string;
  env?: string;
  detail?: string;
  hint?: string;
  code?: string;
  evidence?: { agent?: unknown; run?: unknown; items?: unknown; count?: number; nextCursor?: unknown };
  status?: number;
};

function cursorId(raw: unknown): string {
  const id = String(raw || "").trim();
  if (!id || id.length > 128 || /[/?#]/.test(id)) return "";
  return id;
}

function aionMissingCursor(): AionCursorResult {
  return {
    ok: false,
    source: "ccfl-proxy",
    owner: "aion-brain",
    trinity: "HOLD",
    error: "Aion-Brain is not configured.",
    code: "AION_UNCONFIGURED",
    hint: "Set AION_BASE_URL and AION_API_KEY. Brain owns Cursor (CURSOR_API_KEY on the Brain host, or on this box only if Brain is co-hosted). Do not invent a local Cursor client.",
  };
}

function sanitizeCursorEvidence(raw: unknown): AionCursorResult["evidence"] {
  if (!raw || typeof raw !== "object") return undefined;
  const e = raw as Record<string, unknown>;
  return {
    agent: e.agent && typeof e.agent === "object" ? e.agent : undefined,
    run: e.run && typeof e.run === "object" ? e.run : undefined,
    items: Array.isArray(e.items) ? e.items.slice(0, 50) : undefined,
    count: typeof e.count === "number" ? e.count : undefined,
    nextCursor: typeof e.nextCursor === "string" ? e.nextCursor : undefined,
  };
}

async function aionCursorHttp(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
  context: AionContext = {},
): Promise<AionCursorResult> {
  if (!isAionConfigured()) return aionMissingCursor();
  const { origin, key } = config();
  const timeout = AbortSignal.timeout(30_000);
  const signal = context.signal ? AbortSignal.any([context.signal, timeout]) : timeout;
  try {
    const response = await fetch(origin + path, {
      method,
      headers: { "X-AION-Key": key, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      redirect: "error",
      cache: "no-store",
      signal,
    });
    const json = await response.json().catch(() => ({})) as Record<string, unknown>;
    const error = asString(json.error);
    const unconfigured = Boolean(error && /unconfigured/i.test(error));
    const trinity: AionCursorResult["trinity"] = json.ok === true ? "GO" : unconfigured ? "HOLD" : response.status === 401 || response.status === 403 ? "ABORT" : "HOLD";
    return {
      ok: json.ok === true,
      source: "aion-brain",
      owner: "aion-brain",
      trinity,
      tool: asString(json.tool),
      error: error,
      env: asString(json.env),
      detail: asString(json.detail)?.slice(0, 240),
      hint: unconfigured
        ? "Brain is missing CURSOR_API_KEY. Set that env name on the Aion-Brain host (same DigitalOcean secret name). Never paste the value."
        : undefined,
      code: unconfigured ? "MISSING_KEY" : error,
      evidence: sanitizeCursorEvidence(json.evidence),
      status: response.status,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      source: "ccfl-proxy",
      owner: "aion-brain",
      trinity: "HOLD",
      error: /abort|timeout/i.test(message) ? "Aion-Brain cursor proxy timed out" : "Aion-Brain cursor proxy failed",
      code: /abort|timeout/i.test(message) ? "TIMEOUT" : "TRANSPORT",
      hint: "Check AION_BASE_URL reachability. Do not fall back to a local Cursor stub.",
    };
  }
}

export async function aionCursorLaunch(input: {
  prompt?: string;
  repo?: string;
  repository?: string;
  repos?: unknown;
  branch?: string;
  startingRef?: string;
  name?: string;
  model?: unknown;
  autoCreatePR?: boolean;
  workOnCurrentBranch?: boolean;
  mode?: string;
}, context: AionContext = {}) {
  const prompt = String(input.prompt || "").trim();
  if (!prompt) {
    return { ok: false, source: "ccfl-proxy" as const, owner: "aion-brain" as const, trinity: "HOLD" as const, error: "prompt_required", code: "BAD_ARGS", tool: "cursor_launch" };
  }
  return aionCursorHttp("POST", "/api/cursor/launch", {
    prompt,
    repository: input.repository || input.repo,
    repos: input.repos,
    branch: input.branch,
    startingRef: input.startingRef,
    name: input.name,
    model: input.model,
    autoCreatePR: input.autoCreatePR,
    workOnCurrentBranch: input.workOnCurrentBranch,
    mode: input.mode,
  }, context);
}

export async function aionCursorStatus(input: { id?: string; runId?: string; limit?: number; cursor?: string } = {}, context: AionContext = {}) {
  const id = cursorId(input.id);
  if (!id) {
    const q = new URLSearchParams();
    if (input.limit) q.set("limit", String(input.limit));
    if (input.cursor) q.set("cursor", String(input.cursor));
    return aionCursorHttp("GET", `/api/cursor${q.toString() ? `?${q}` : ""}`, undefined, context);
  }
  const q = input.runId ? `?runId=${encodeURIComponent(input.runId)}` : "";
  return aionCursorHttp("GET", `/api/cursor/${encodeURIComponent(id)}${q}`, undefined, context);
}

export async function aionCursorReply(input: { id?: string; prompt?: string; mode?: string }, context: AionContext = {}) {
  const id = cursorId(input.id);
  const prompt = String(input.prompt || "").trim();
  if (!id) return { ok: false, source: "ccfl-proxy" as const, owner: "aion-brain" as const, trinity: "HOLD" as const, error: "id_required", code: "BAD_ARGS", tool: "cursor_reply" };
  if (!prompt) return { ok: false, source: "ccfl-proxy" as const, owner: "aion-brain" as const, trinity: "HOLD" as const, error: "prompt_required", code: "BAD_ARGS", tool: "cursor_reply" };
  return aionCursorHttp("POST", `/api/cursor/${encodeURIComponent(id)}/reply`, { prompt, mode: input.mode }, context);
}

export async function aionCursorCancel(input: { id?: string; runId?: string }, context: AionContext = {}) {
  const id = cursorId(input.id);
  if (!id) return { ok: false, source: "ccfl-proxy" as const, owner: "aion-brain" as const, trinity: "HOLD" as const, error: "id_required", code: "BAD_ARGS", tool: "cursor_cancel" };
  return aionCursorHttp("POST", `/api/cursor/${encodeURIComponent(id)}/cancel`, { runId: input.runId }, context);
}
