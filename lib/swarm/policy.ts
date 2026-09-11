import type { PlannedTask, SwarmLimits, SwarmRole, TokenUsage } from "./types";

export const SWARM_MAX_AGENTS = 4;
export const SWARM_MAX_DEPTH = 2;
export const SWARM_MAX_ATTEMPTS = 2;
export const SWARM_MAX_CONCURRENT_RUNS = 1;
export const SWARM_DEADLINE_MS = 180_000;
export const SWARM_MAX_OBJECTIVE = 2_000;
export const SWARM_MAX_LLM_CALLS = 8;
export const SWARM_MAX_FETCHES = 4;
export const SWARM_FETCH_BYTES = 40_000;
export const SWARM_FETCH_CHARS = 8_000;
export const SWARM_FETCH_TIMEOUT_MS = 8_000;
export const SWARM_MAX_TASK_RESULT = 6_000;

export const SWARM_MAX_TOKENS = {
  planner: 700,
  researcher: 520,
  critic: 520,
  synthesizer: 900,
} as const;

const WORKER_ROLES = new Set<Exclude<SwarmRole, "planner">>(["researcher", "critic", "synthesizer"]);

const PRIVATE_HOST =
  /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)$/i;

export function emptyUsage(): TokenUsage {
  return { promptTokens: 0, completionTokens: 0, calls: 0 };
}

export function addUsage(a: TokenUsage, b: { promptTokens: number; completionTokens: number; calls?: number }): TokenUsage {
  return {
    promptTokens: a.promptTokens + (b.promptTokens || 0),
    completionTokens: a.completionTokens + (b.completionTokens || 0),
    calls: a.calls + (b.calls ?? 1),
  };
}

export function parseLimits(raw?: Partial<SwarmLimits>): SwarmLimits {
  const maxAgents = clampInt(raw?.maxAgents, 2, SWARM_MAX_AGENTS, 4);
  return {
    maxAgents,
    maxDepth: clampInt(raw?.maxDepth, 1, SWARM_MAX_DEPTH, 2),
    maxAttempts: clampInt(raw?.maxAttempts, 1, SWARM_MAX_ATTEMPTS, 2),
    deadlineMs: clampInt(raw?.deadlineMs, 30_000, SWARM_DEADLINE_MS, 120_000),
    maxLlmCalls: clampInt(raw?.maxLlmCalls, 2, SWARM_MAX_LLM_CALLS, SWARM_MAX_LLM_CALLS),
    maxFetches: clampInt(raw?.maxFetches, 0, SWARM_MAX_FETCHES, 3),
    mode: raw?.mode === "led" ? "led" : "auto",
  };
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

export function sanitizeObjective(raw: unknown): { ok: true; objective: string } | { ok: false; error: string } {
  const objective = String(raw ?? "").trim();
  if (!objective) return { ok: false, error: "Objective is required" };
  if (objective.length > SWARM_MAX_OBJECTIVE) {
    return { ok: false, error: `Objective must be under ${SWARM_MAX_OBJECTIVE} characters` };
  }
  return { ok: true, objective };
}

export function guardFetchUrl(raw: unknown): { ok: true; url: string } | { ok: false; error: string } {
  const value = String(raw ?? "").trim();
  if (!value) return { ok: false, error: "url is required" };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, error: "Invalid URL" };
  }
  if (!/^https?:$/.test(url.protocol)) return { ok: false, error: "Only http(s) URLs are allowed" };
  const host = url.hostname;
  if (PRIVATE_HOST.test(host) || host.endsWith(".local") || host.endsWith(".internal")) {
    return { ok: false, error: "Private and local network targets are blocked" };
  }
  if (host === "169.254.169.254" || host === "metadata.google.internal") {
    return { ok: false, error: "Cloud metadata endpoints are blocked" };
  }
  return { ok: true, url: url.toString() };
}

export function defaultPlan(objective: string, maxAgents: number): PlannedTask[] {
  const researchA: PlannedTask = {
    id: "research-a",
    role: "researcher",
    objective: `Collect the strongest supporting evidence, facts, and arguments for: ${objective}`,
    dependsOn: [],
  };
  const researchB: PlannedTask = {
    id: "research-b",
    role: "researcher",
    objective: `Collect counter-evidence, alternatives, risks, and missing assumptions for: ${objective}`,
    dependsOn: [],
  };
  const critic: PlannedTask = {
    id: "critic",
    role: "critic",
    objective: "Find contradictions, weak claims, and gaps across the research findings. Do not invent sources.",
    dependsOn: ["research-a", "research-b"],
  };
  const synth: PlannedTask = {
    id: "synth",
    role: "synthesizer",
    objective: `Produce the final operator-facing answer for: ${objective}. Be decisive. Cite which worker findings you used. Do not dump hidden chain-of-thought.`,
    dependsOn: maxAgents >= 4 ? ["critic"] : maxAgents >= 3 ? ["research-a", "research-b"] : ["research-a"],
  };
  if (maxAgents <= 1) return [{ ...synth, dependsOn: [], objective: `Answer directly: ${objective}` }];
  if (maxAgents === 2) return [researchA, synth];
  if (maxAgents === 3) return [researchA, researchB, { ...synth, dependsOn: ["research-a", "research-b"] }];
  return [researchA, researchB, critic, synth];
}

export function validatePlan(
  tasks: PlannedTask[],
  limits: SwarmLimits,
): { ok: true; tasks: PlannedTask[] } | { ok: false; error: string } {
  if (!Array.isArray(tasks) || tasks.length === 0) return { ok: false, error: "Plan has no tasks" };
  if (tasks.length > limits.maxAgents) {
    return { ok: false, error: `Plan has ${tasks.length} agents; max is ${limits.maxAgents}` };
  }
  const ids = new Set<string>();
  const byId = new Map<string, PlannedTask>();
  for (const raw of tasks) {
    if (!raw || typeof raw !== "object") return { ok: false, error: "Invalid task" };
    const id = slugId(raw.id);
    if (!id) return { ok: false, error: "Each task needs an id" };
    if (ids.has(id)) return { ok: false, error: `Duplicate task id ${id}` };
    if (!WORKER_ROLES.has(raw.role)) return { ok: false, error: `Illegal role ${String(raw.role)}` };
    const objective = String(raw.objective || "").trim();
    if (!objective) return { ok: false, error: `Task ${id} has no objective` };
    ids.add(id);
    byId.set(id, {
      id,
      role: raw.role,
      objective: objective.slice(0, 1200),
      dependsOn: Array.isArray(raw.dependsOn) ? raw.dependsOn.map(slugId).filter(Boolean) : [],
      urls: Array.isArray(raw.urls) ? raw.urls.slice(0, 3) : [],
    });
  }
  const cleaned = [...byId.values()];
  for (const task of cleaned) {
    for (const dep of task.dependsOn) {
      if (!byId.has(dep)) return { ok: false, error: `Task ${task.id} depends on unknown ${dep}` };
      if (dep === task.id) return { ok: false, error: `Task ${task.id} depends on itself` };
    }
  }
  if (hasCycle(cleaned)) return { ok: false, error: "Plan contains a cycle" };
  const depth = maxDepth(cleaned);
  if (depth > limits.maxDepth) {
    return { ok: false, error: `Plan depth ${depth} exceeds max ${limits.maxDepth}` };
  }
  if (!cleaned.some((t) => t.role === "synthesizer")) {
    return { ok: false, error: "Plan must include a synthesizer (leader)" };
  }
  return { ok: true, tasks: cleaned };
}

function slugId(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function hasCycle(tasks: PlannedTask[]): boolean {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const visiting = new Set<string>();
  const seen = new Set<string>();
  const walk = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (seen.has(id)) return false;
    visiting.add(id);
    const node = byId.get(id);
    for (const dep of node?.dependsOn ?? []) {
      if (walk(dep)) return true;
    }
    visiting.delete(id);
    seen.add(id);
    return false;
  };
  return tasks.some((t) => walk(t.id));
}

function maxDepth(tasks: PlannedTask[]): number {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const memo = new Map<string, number>();
  const depthOf = (id: string, stack: Set<string>): number => {
    if (memo.has(id)) return memo.get(id)!;
    if (stack.has(id)) return 99;
    const node = byId.get(id);
    if (!node || node.dependsOn.length === 0) {
      memo.set(id, 0);
      return 0;
    }
    stack.add(id);
    const d = 1 + Math.max(...node.dependsOn.map((dep) => depthOf(dep, stack)));
    stack.delete(id);
    memo.set(id, d);
    return d;
  };
  return Math.max(0, ...tasks.map((t) => depthOf(t.id, new Set())));
}

export function extractJsonObject(text: string): unknown {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fence ? fence[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Planner did not return JSON");
  return JSON.parse(raw.slice(start, end + 1));
}

export function parsePlannerOutput(text: string, limits: SwarmLimits): PlannedTask[] {
  const parsed = extractJsonObject(text) as { tasks?: unknown };
  const rows = Array.isArray(parsed.tasks) ? parsed.tasks : [];
  const mapped: PlannedTask[] = rows.map((row, i) => {
    const rec = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
    const roleRaw = String(rec.role || "researcher");
    const role = WORKER_ROLES.has(roleRaw as never) ? (roleRaw as PlannedTask["role"]) : "researcher";
    return {
      id: String(rec.id || `task-${i + 1}`),
      role,
      objective: String(rec.objective || rec.goal || ""),
      dependsOn: Array.isArray(rec.depends_on)
        ? rec.depends_on.map(String)
        : Array.isArray(rec.dependsOn)
          ? rec.dependsOn.map(String)
          : [],
      urls: Array.isArray(rec.urls) ? rec.urls.map(String) : [],
    };
  });
  const checked = validatePlan(mapped, limits);
  if (!checked.ok) throw new Error(checked.error);
  return checked.tasks;
}

export function budgetExceeded(usage: TokenUsage, limits: SwarmLimits): string | null {
  if (usage.calls >= limits.maxLlmCalls) return `LLM call budget reached (${limits.maxLlmCalls})`;
  return null;
}
