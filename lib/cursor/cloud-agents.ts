// Cursor Cloud Agents API v1 client.
// Auth: process.env.CURSOR_API_KEY only (Basic `-u KEY:`). Never log or return the key.

import {
  CURSOR_API_DEFAULT_BASE,
  type CursorAgent,
  type CursorLaunchInput,
  type CursorPrompt,
  type CursorRun,
} from "./types";
import { buildCursorBrief, normalizeGithubRepo } from "./brief";

const TIMEOUT_MS = 30_000;

export function isCursorConfigured(): boolean {
  return Boolean(process.env.CURSOR_API_KEY?.trim());
}

export function cursorMissingKey(): {
  ok: false;
  via: "cursor";
  trinity: "HOLD";
  error: string;
  code: "MISSING_KEY";
  hint: string;
  owner: "ccfl";
} {
  return {
    ok: false,
    via: "cursor",
    trinity: "HOLD",
    error: "CURSOR_API_KEY is not configured.",
    code: "MISSING_KEY",
    hint: "Set CURSOR_API_KEY as a server secret (already expected on DigitalOcean). Never paste the key into chat or source. Cursor Cloud Agents cannot launch until the env name is present.",
    owner: "ccfl",
  };
}

function apiKey(): string {
  return process.env.CURSOR_API_KEY?.trim() || "";
}

export function cursorApiBase(): string {
  const raw = process.env.CURSOR_API_BASE_URL?.trim() || CURSOR_API_DEFAULT_BASE;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return CURSOR_API_DEFAULT_BASE;
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    return CURSOR_API_DEFAULT_BASE;
  }
  if (url.username || url.password || url.search || url.hash) return CURSOR_API_DEFAULT_BASE;
  return url.origin;
}

function basicAuth(key: string): string {
  return `Basic ${Buffer.from(`${key}:`, "utf8").toString("base64")}`;
}

function redact(text: string): string {
  const key = apiKey();
  let out = text;
  if (key) out = out.split(key).join("[redacted]");
  return out.replace(/Basic\s+[A-Za-z0-9+/=]+/gi, "Basic [redacted]").replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
}

function asAgent(raw: unknown): CursorAgent | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  const id = typeof a.id === "string" ? a.id : "";
  if (!id) return null;
  return {
    id,
    name: typeof a.name === "string" ? a.name : undefined,
    status: typeof a.status === "string" ? a.status : undefined,
    url: typeof a.url === "string" ? a.url : undefined,
    repos: Array.isArray(a.repos) ? a.repos as CursorAgent["repos"] : undefined,
    latestRunId: typeof a.latestRunId === "string" ? a.latestRunId : undefined,
    createdAt: typeof a.createdAt === "string" ? a.createdAt : undefined,
    updatedAt: typeof a.updatedAt === "string" ? a.updatedAt : undefined,
    autoCreatePR: typeof a.autoCreatePR === "boolean" ? a.autoCreatePR : undefined,
  };
}

function asRun(raw: unknown): CursorRun | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === "string" ? r.id : "";
  if (!id) return null;
  const git = r.git && typeof r.git === "object" ? r.git as CursorRun["git"] : undefined;
  return {
    id,
    agentId: typeof r.agentId === "string" ? r.agentId : undefined,
    status: typeof r.status === "string" ? r.status : undefined,
    createdAt: typeof r.createdAt === "string" ? r.createdAt : undefined,
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : undefined,
    durationMs: typeof r.durationMs === "number" ? r.durationMs : undefined,
    result: typeof r.result === "string" ? r.result.slice(0, 4000) : undefined,
    git,
  };
}

export type CursorRequestResult = {
  ok: boolean;
  status: number;
  data: unknown;
  error?: string;
  code?: string;
  hint?: string;
};

export async function cursorRequest(
  method: string,
  path: string,
  body?: unknown,
  timeoutMs = TIMEOUT_MS,
): Promise<CursorRequestResult> {
  const key = apiKey();
  if (!key) return { ok: false, status: 503, data: null, error: cursorMissingKey().error, code: "MISSING_KEY" };
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(`${cursorApiBase()}${path}`, {
      method,
      headers: {
        Authorization: basicAuth(key),
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      redirect: "error",
      cache: "no-store",
      signal: ac.signal,
    });
    const text = await res.text();
    let data: unknown = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: redact(text).slice(0, 240) }; }
    if (!res.ok) {
      const rec = data && typeof data === "object" ? data as Record<string, unknown> : {};
      const errObj = rec.error && typeof rec.error === "object" ? rec.error as Record<string, unknown> : rec;
      const code = typeof errObj.code === "string" ? errObj.code : typeof rec.code === "string" ? rec.code : `HTTP_${res.status}`;
      const message = typeof errObj.message === "string" ? errObj.message : typeof rec.message === "string" ? rec.message : `Cursor HTTP ${res.status}`;
      return { ok: false, status: res.status, data: null, error: redact(message).slice(0, 240), code: redact(code).slice(0, 80) };
    }
    return { ok: true, status: res.status, data };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const aborted = /abort|timeout/i.test(message);
    return {
      ok: false,
      status: aborted ? 504 : 502,
      data: null,
      error: aborted ? "Cursor API timed out" : redact(message).slice(0, 200),
      code: aborted ? "TIMEOUT" : "TRANSPORT",
    };
  } finally {
    clearTimeout(timer);
  }
}

export function compileLaunchBody(input: CursorLaunchInput): { ok: true; body: Record<string, unknown>; brief: string; repo?: string } | { ok: false; error: string; code: string } {
  const goal = String(input.prompt || "").trim();
  if (!goal || goal.length > 20_000) return { ok: false, error: "prompt/goal must be 1–20,000 characters", code: "BAD_ARGS" };
  let repo: string | undefined;
  if (!input.noRepo) {
    const normalized = normalizeGithubRepo(input.repo);
    if (!normalized.ok) return { ok: false, error: normalized.error, code: "BAD_ARGS" };
    repo = normalized.url;
  }
  const brief = buildCursorBrief({
    goal,
    repo,
    context: input.context,
    successCriteria: input.successCriteria,
  });
  const prompt: CursorPrompt = { text: brief };
  const body: Record<string, unknown> = { prompt };
  if (repo) {
    body.repos = [{ url: repo, ...(input.ref ? { startingRef: String(input.ref).trim() } : {}) }];
  }
  if (input.name) body.name = String(input.name).trim().slice(0, 100);
  if (input.model) body.model = { id: String(input.model).trim() };
  if (input.mode === "plan" || input.mode === "agent") body.mode = input.mode;
  if (typeof input.autoCreatePR === "boolean") body.autoCreatePR = input.autoCreatePR;
  return { ok: true, body, brief, repo };
}

export async function launchCursorAgent(input: CursorLaunchInput) {
  if (!isCursorConfigured()) return cursorMissingKey();
  const compiled = compileLaunchBody(input);
  if (!compiled.ok) return { ok: false as const, trinity: "HOLD" as const, error: compiled.error, code: compiled.code, owner: "ccfl" as const };
  const res = await cursorRequest("POST", "/v1/agents", compiled.body);
  if (!res.ok) {
    return {
      ok: false as const,
      via: "cursor" as const,
      op: "launch",
      trinity: res.status >= 500 ? "HOLD" as const : "ABORT" as const,
      error: res.error || "Cursor launch failed",
      code: res.code,
      status: res.status,
      owner: "ccfl" as const,
    };
  }
  const payload = res.data && typeof res.data === "object" ? res.data as Record<string, unknown> : {};
  const agent = asAgent(payload.agent) || asAgent(payload);
  const run = asRun(payload.run);
  return {
    ok: true as const,
    via: "cursor" as const,
    op: "launch",
    trinity: "GO" as const,
    owner: "ccfl" as const,
    agent,
    run,
    brief: compiled.brief,
    repo: compiled.repo,
    contract: "CCFL owns Cursor Cloud Agent jobs. Aion /api/agent/run is claw execute, not this API.",
  };
}

export async function listCursorAgents(input: { limit?: number; cursor?: string; includeArchived?: boolean } = {}) {
  if (!isCursorConfigured()) return cursorMissingKey();
  const q = new URLSearchParams();
  const limit = Math.min(100, Math.max(1, Number(input.limit) || 20));
  q.set("limit", String(limit));
  if (input.cursor) q.set("cursor", String(input.cursor));
  if (input.includeArchived === false) q.set("includeArchived", "false");
  const res = await cursorRequest("GET", `/v1/agents?${q.toString()}`);
  if (!res.ok) {
    return { ok: false as const, via: "cursor" as const, op: "list", trinity: "HOLD" as const, error: res.error, code: res.code, status: res.status, owner: "ccfl" as const };
  }
  const payload = res.data && typeof res.data === "object" ? res.data as Record<string, unknown> : {};
  const items = Array.isArray(payload.items) ? payload.items.map(asAgent).filter(Boolean) as CursorAgent[] : [];
  return {
    ok: true as const,
    via: "cursor" as const,
    op: "list",
    trinity: "GO" as const,
    owner: "ccfl" as const,
    agents: items,
    nextCursor: typeof payload.nextCursor === "string" ? payload.nextCursor : undefined,
  };
}

export async function getCursorAgent(id: string) {
  if (!isCursorConfigured()) return cursorMissingKey();
  const agentId = String(id || "").trim();
  if (!agentId) return { ok: false as const, trinity: "HOLD" as const, error: "id is required", code: "BAD_ARGS", owner: "ccfl" as const };
  const res = await cursorRequest("GET", `/v1/agents/${encodeURIComponent(agentId)}`);
  if (!res.ok) {
    return { ok: false as const, via: "cursor" as const, op: "status", trinity: "HOLD" as const, error: res.error, code: res.code, status: res.status, owner: "ccfl" as const };
  }
  const agent = asAgent(res.data);
  let run: CursorRun | null = null;
  if (agent?.latestRunId) {
    const runRes = await cursorRequest("GET", `/v1/agents/${encodeURIComponent(agentId)}/runs/${encodeURIComponent(agent.latestRunId)}`);
    if (runRes.ok) run = asRun(runRes.data);
  }
  return {
    ok: true as const,
    via: "cursor" as const,
    op: "status",
    trinity: "GO" as const,
    owner: "ccfl" as const,
    agent,
    run,
  };
}

export async function replyCursorAgent(input: { id: string; prompt: string; mode?: "agent" | "plan" }) {
  if (!isCursorConfigured()) return cursorMissingKey();
  const agentId = String(input.id || "").trim();
  const text = String(input.prompt || "").trim();
  if (!agentId) return { ok: false as const, trinity: "HOLD" as const, error: "id is required", code: "BAD_ARGS", owner: "ccfl" as const };
  if (!text || text.length > 20_000) return { ok: false as const, trinity: "HOLD" as const, error: "prompt must be 1–20,000 characters", code: "BAD_ARGS", owner: "ccfl" as const };
  const body: Record<string, unknown> = { prompt: { text } };
  if (input.mode === "plan" || input.mode === "agent") body.mode = input.mode;
  const res = await cursorRequest("POST", `/v1/agents/${encodeURIComponent(agentId)}/runs`, body);
  if (!res.ok) {
    const busy = res.status === 409;
    return {
      ok: false as const,
      via: "cursor" as const,
      op: "reply",
      trinity: busy ? "HOLD" as const : "ABORT" as const,
      error: res.error || "Cursor reply failed",
      code: res.code,
      status: res.status,
      hint: busy ? "Wait for the current run to finish or cursor_cancel it, then reply." : undefined,
      owner: "ccfl" as const,
    };
  }
  const payload = res.data && typeof res.data === "object" ? res.data as Record<string, unknown> : {};
  return {
    ok: true as const,
    via: "cursor" as const,
    op: "reply",
    trinity: "GO" as const,
    owner: "ccfl" as const,
    run: asRun(payload.run) || asRun(payload),
    agent: { id: agentId },
  };
}

export async function cancelCursorRun(input: { id: string; runId?: string }) {
  if (!isCursorConfigured()) return cursorMissingKey();
  const agentId = String(input.id || "").trim();
  if (!agentId) return { ok: false as const, trinity: "HOLD" as const, error: "id is required", code: "BAD_ARGS", owner: "ccfl" as const };
  let runId = String(input.runId || "").trim();
  if (!runId) {
    const agentRes = await cursorRequest("GET", `/v1/agents/${encodeURIComponent(agentId)}`);
    if (!agentRes.ok) {
      return { ok: false as const, via: "cursor" as const, op: "cancel", trinity: "HOLD" as const, error: agentRes.error, code: agentRes.code, status: agentRes.status, owner: "ccfl" as const };
    }
    const agent = asAgent(agentRes.data);
    runId = agent?.latestRunId || "";
    if (!runId) return { ok: false as const, trinity: "HOLD" as const, error: "No latestRunId to cancel", code: "NO_RUN", owner: "ccfl" as const };
  }
  const res = await cursorRequest("POST", `/v1/agents/${encodeURIComponent(agentId)}/runs/${encodeURIComponent(runId)}/cancel`);
  if (!res.ok) {
    return {
      ok: false as const,
      via: "cursor" as const,
      op: "cancel",
      trinity: res.status === 409 ? "HOLD" as const : "ABORT" as const,
      error: res.error || "Cursor cancel failed",
      code: res.code,
      status: res.status,
      hint: res.status === 409 ? "Run is already terminal (run_not_cancellable)." : undefined,
      owner: "ccfl" as const,
    };
  }
  const payload = res.data && typeof res.data === "object" ? res.data as Record<string, unknown> : {};
  return {
    ok: true as const,
    via: "cursor" as const,
    op: "cancel",
    trinity: "GO" as const,
    owner: "ccfl" as const,
    run: asRun(payload) || { id: runId, status: "CANCELLED" },
    agent: { id: agentId },
  };
}

export async function cursorMe() {
  if (!isCursorConfigured()) return cursorMissingKey();
  const res = await cursorRequest("GET", "/v1/me", undefined, 12_000);
  if (!res.ok) {
    return { ok: false as const, via: "cursor" as const, op: "me", trinity: "HOLD" as const, error: res.error, code: res.code, status: res.status, owner: "ccfl" as const };
  }
  const payload = res.data && typeof res.data === "object" ? res.data as Record<string, unknown> : {};
  return {
    ok: true as const,
    via: "cursor" as const,
    op: "me",
    trinity: "GO" as const,
    owner: "ccfl" as const,
    configured: true,
    apiKeyName: typeof payload.apiKeyName === "string" ? payload.apiKeyName : undefined,
    createdAt: typeof payload.createdAt === "string" ? payload.createdAt : undefined,
    scoped: typeof payload.userId === "number" ? "user" : "service",
  };
}
