// Ad-hoc ephemeral worker briefs. Default path is NOT a prefab role list.
import { PRESET_WORKER_ROLES, WORKER_TOOL_NAMES, type PresetWorkerRole, type TaskBrief, type WorkerToolName } from "./types";

export const DEFAULT_WORKER_TOOLS: WorkerToolName[] = ["search", "fetch"];

export type SpawnSpec = {
  goal: string;
  context: string;
  tools: WorkerToolName[];
  successCriteria: string[];
  label: string;
  urls: string[];
  dependsOn: string[];
  parentId: string | null;
  runId?: string;
  preset: PresetWorkerRole | null;
  runner: "local" | "aion";
  ephemeral: boolean;
};

export function isPresetWorkerRole(value: unknown): value is PresetWorkerRole {
  return typeof value === "string" && (PRESET_WORKER_ROLES as readonly string[]).includes(value);
}

export function normalizeWorkerTools(raw: unknown): WorkerToolName[] {
  if (!Array.isArray(raw) || raw.length === 0) return [...DEFAULT_WORKER_TOOLS];
  const out: WorkerToolName[] = [];
  for (const item of raw) {
    const name = String(item || "").toLowerCase().trim();
    if ((WORKER_TOOL_NAMES as readonly string[]).includes(name) && !out.includes(name as WorkerToolName)) {
      out.push(name as WorkerToolName);
    }
  }
  return out.length ? out : [...DEFAULT_WORKER_TOOLS];
}

export function normalizeCriteria(raw: unknown): string[] {
  if (typeof raw === "string" && raw.trim()) {
    return raw.split(/\n|;/).map((s) => s.trim()).filter(Boolean).slice(0, 8);
  }
  if (!Array.isArray(raw)) return [];
  return raw.map((s) => String(s || "").trim()).filter(Boolean).slice(0, 8);
}

export function buildTaskBrief(input: {
  label?: string;
  context?: string;
  tools?: unknown;
  successCriteria?: unknown;
  preset?: unknown;
  runner?: unknown;
  ephemeral?: unknown;
}): TaskBrief {
  const preset = isPresetWorkerRole(input.preset) ? input.preset : null;
  return {
    label: String(input.label || "ad-hoc").trim().slice(0, 80) || "ad-hoc",
    context: String(input.context || "").trim().slice(0, 4000),
    tools: normalizeWorkerTools(input.tools),
    successCriteria: normalizeCriteria(input.successCriteria),
    ephemeral: input.ephemeral !== false,
    preset,
    runner: input.runner === "aion" ? "aion" : "local",
  };
}

export function parseSpawnSpec(input: {
  goal?: unknown;
  objective?: unknown;
  task?: unknown;
  context?: unknown;
  tools?: unknown;
  successCriteria?: unknown;
  criteria?: unknown;
  label?: unknown;
  urls?: unknown;
  dependsOn?: unknown;
  parentId?: unknown;
  runId?: unknown;
  preset?: unknown;
  role?: unknown;
  runner?: unknown;
  ephemeral?: unknown;
}): { ok: true; spec: SpawnSpec } | { ok: false; error: string } {
  const goal = String(input.goal || input.objective || input.task || "").trim();
  if (!goal) return { ok: false, error: "goal is required" };
  if (goal.length > 2000) return { ok: false, error: "goal must be under 2000 characters" };
  const preset = isPresetWorkerRole(input.preset) ? input.preset : isPresetWorkerRole(input.role) ? input.role : null;
  const brief = buildTaskBrief({
    label: input.label == null ? undefined : String(input.label),
    context: input.context == null ? undefined : String(input.context),
    tools: input.tools,
    successCriteria: input.successCriteria ?? input.criteria,
    preset,
    runner: input.runner,
    ephemeral: input.ephemeral,
  });
  return {
    ok: true,
    spec: {
      goal,
      context: brief.context,
      tools: brief.tools,
      successCriteria: brief.successCriteria,
      label: brief.label,
      urls: Array.isArray(input.urls) ? input.urls.map(String).filter(Boolean).slice(0, 3) : [],
      dependsOn: Array.isArray(input.dependsOn) ? input.dependsOn.map(String).filter(Boolean).slice(0, 4) : [],
      parentId: input.parentId ? String(input.parentId) : null,
      runId: input.runId ? String(input.runId).trim() || undefined : undefined,
      preset: brief.preset,
      runner: brief.runner,
      ephemeral: brief.ephemeral,
    },
  };
}

export function workerSystemPrompt(brief: TaskBrief, role: string): string {
  if (brief.preset === "researcher") {
    return "You are an independent researcher session spawned for one goal. Search or fetch only if those tools are listed. Return structured findings: claims, evidence, unknowns, confidence. No hidden chain-of-thought.";
  }
  if (brief.preset === "critic") {
    return "You are an independent critic session spawned for one goal. Attack weak claims. Fetch only to verify. Do not produce the final operator answer.";
  }
  if (brief.preset === "synthesizer") {
    return "You are a one-shot synthesizer spawned for this goal. Write the operator-facing answer from the brief and upstream findings only. Cite evidence. No hidden chain-of-thought.";
  }
  const tools = brief.tools.length ? brief.tools.join(", ") : "none";
  const checks = brief.successCriteria.length
    ? brief.successCriteria.map((c, i) => `${i + 1}. ${c}`).join("\n")
    : "1. Answer the goal with evidence you actually collected.\n2. Label unknowns instead of inventing facts.";
  return `You are an ephemeral worker spawned on the spot — not a prefabricated specialist.
Label: ${brief.label}
Role token (routing only): ${role}
Allowed tools: ${tools}
Success criteria:
${checks}

Rules:
- Stay inside this brief. Do not claim tools you were not given.
- Evidence only. If a criterion is unmet, say HOLD and what is missing.
- No hidden chain-of-thought. Return only the parent-facing output.
- When finished, JSON {"action":"done","output":"..."}.`;
}

export function workerUserBrief(input: {
  taskId: string;
  goal: string;
  brief: TaskBrief;
  upstream: string;
  evidence: string[];
}): string {
  return [
    `TASK_ID: ${input.taskId}`,
    `GOAL: ${input.goal}`,
    input.brief.context ? `CONTEXT:\n${input.brief.context}` : "CONTEXT: (none)",
    input.brief.successCriteria.length
      ? `SUCCESS_CRITERIA:\n${input.brief.successCriteria.map((c, i) => `${i + 1}. ${c}`).join("\n")}`
      : "SUCCESS_CRITERIA: (parent will judge from the output)",
    input.upstream ? `UPSTREAM_FINDINGS:\n${input.upstream}` : "UPSTREAM_FINDINGS: (none)",
    input.evidence.length ? `FETCHED_EVIDENCE:\n${input.evidence.join("\n---\n")}` : "FETCHED_EVIDENCE: (none)",
    input.brief.tools.length
      ? `Choose a tool from [${input.brief.tools.join(", ")}] or action=done.`
      : "No tools. Return action=done with the output.",
  ].join("\n\n");
}
