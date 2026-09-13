import { productionGateway, routeLabel } from "./gateway";
import { addUsage, budgetExceeded, parseLimits, sanitizeObjective, SWARM_MAX_CONCURRENT_RUNS } from "./policy";
import { planTasks } from "./planner";
import {
  activeRunCount,
  appendEvent,
  abortTaskController,
  cancelOneTask,
  cleanupTask,
  createRunRecord,
  deleteRunRecord,
  claimTask,
  getController,
  getRun,
  getTask,
  getTaskController,
  getTasks,
  heartbeatTask,
  insertTask,
  listMessages,
  listOpenRuns,
  listRuns,
  markCancelled,
  patchRun,
  patchTask,
  postMessage,
  recoverExpiredLeases,
  readyTasks,
  saveTaskResult,
  seedTasks,
  snapshot,
  swarmStoreStatus,
} from "./store";
import { buildTaskBrief, parseSpawnSpec } from "./spawn";
import { hydrateSwarmFromPg } from "./pg-mirror";
import { collectUpstream, runWorker } from "./worker";
import type { ModelGateway, PublicSwarmRun, SwarmLimits } from "./types";
import { SWARM_CONTRACT } from "./types";

const executing = new Set<string>();

export function swarmStatus(gateway?: ModelGateway) {
  resumeOpenSwarm(gateway);
  const gw = gateway ?? productionGateway();
  return {
    ok: true as const,
    live: gw.available,
    contract: SWARM_CONTRACT,
    gateway: { name: gw.name, available: gw.available, note: gw.note },
    store: swarmStoreStatus(),
    active: activeRunCount(),
    cap: SWARM_MAX_CONCURRENT_RUNS,
    note: "Default path is ad-hoc spawn (goal + context + tools + criteria). Planner DAG is an optional preset. Computer keeps Chrome. Forge keeps its lab.",
  };
}

export function listSwarm(): PublicSwarmRun[] {
  return listRuns()
    .map((r) => snapshot(r.id))
    .filter((r): r is PublicSwarmRun => Boolean(r));
}

export function getSwarm(id: string): PublicSwarmRun | null {
  return snapshot(id);
}

export function startSwarmRun(input: {
  objective: string;
  limits?: Partial<SwarmLimits>;
  gateway?: ModelGateway;
}): { ok: true; run: PublicSwarmRun } | { ok: false; error: string } {
  resumeOpenSwarm(input.gateway);
  const objective = sanitizeObjective(input.objective);
  if (!objective.ok) return objective;
  if (activeRunCount() >= SWARM_MAX_CONCURRENT_RUNS) {
    return { ok: false, error: "A swarm is already running. Cancel it or wait." };
  }
  const gw = input.gateway ?? productionGateway();
  if (!gw.available) return { ok: false, error: gw.note };
  const limits = parseLimits(input.limits);
  const run = createRunRecord(objective.objective, limits, gw.note);
  void executeRun(run.id, gw).catch((e) => {
    const message = e instanceof Error ? e.message : "swarm failed";
    try {
      patchRun(run.id, { status: "failed", error: message, completedAt: Date.now() });
      appendEvent(run.id, null, "run.failed", { error: message });
    } catch {
      /* already gone */
    }
  });
  return { ok: true, run: snapshot(run.id)! };
}

export function cancelSwarm(id: string): PublicSwarmRun | null {
  const run = getRun(id);
  if (!run) return null;
  if (run.status === "completed" || run.status === "failed" || run.status === "cancelled") return snapshot(id);
  patchRun(id, { status: "cancelling" });
  appendEvent(id, null, "run.cancelling", {});
  markCancelled(id, "Operator cancelled");
  return snapshot(id);
}

function nid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

export function spawnEphemeralAgent(input: {
  goal?: string;
  objective?: string;
  task?: string;
  context?: string;
  tools?: unknown;
  successCriteria?: unknown;
  criteria?: unknown;
  label?: string;
  urls?: string[];
  dependsOn?: string[];
  parentId?: string;
  runId?: string;
  preset?: string;
  role?: string;
  runner?: "local" | "aion";
  ephemeral?: boolean;
  gateway?: ModelGateway;
}): { ok: true; run: PublicSwarmRun; taskId: string; brief: ReturnType<typeof buildTaskBrief> } | { ok: false; error: string } {
  const parsed = parseSpawnSpec(input);
  if (!parsed.ok) return parsed;
  const spec = parsed.spec;
  const objective = sanitizeObjective(spec.goal);
  if (!objective.ok) return objective;
  const gw = input.gateway ?? productionGateway();
  if (!gw.available) return { ok: false, error: gw.note };

  const brief = buildTaskBrief(spec);
  const role = brief.preset ?? "worker";

  let runId = spec.runId;
  if (!runId) {
    const openLed = listOpenRuns().find((r) => r.limits.mode === "led");
    if (openLed) {
      runId = openLed.id;
    } else {
      if (activeRunCount() >= SWARM_MAX_CONCURRENT_RUNS) {
        return { ok: false, error: "A swarm is already running. Pass that runId to spawn onto it, or cancel it." };
      }
      const run = createRunRecord(objective.objective, parseLimits({ mode: "led", maxAgents: 8, maxLlmCalls: 16 }), gw.note);
      runId = run.id;
      const createdId = run.id;
      void executeRun(createdId, gw).catch((e) => {
        const message = e instanceof Error ? e.message : "swarm failed";
        try {
          patchRun(createdId, { status: "failed", error: message, completedAt: Date.now() });
          appendEvent(createdId, null, "run.failed", { error: message });
        } catch {
          /* gone */
        }
      });
    }
  }

  if (!runId) return { ok: false, error: "Failed to open a spawn session" };
  const live = getRun(runId);
  if (!live) return { ok: false, error: "Unknown run" };
  if (["completed", "failed", "cancelled"].includes(live.status)) {
    return { ok: false, error: "Run is closed. Spawn again without runId to start a new ephemeral session." };
  }
  const existing = getTasks(runId).filter((t) => !t.cleanedUpAt);
  if (existing.length >= live.limits.maxAgents) {
    return { ok: false, error: `max agents (${live.limits.maxAgents}) reached` };
  }
  const task = insertTask(
    runId,
    {
      id: nid(brief.label.replace(/[^a-z0-9]+/gi, "").slice(0, 3) || "wrk"),
      role,
      objective: objective.objective,
      dependsOn: spec.dependsOn,
      urls: spec.urls,
      brief,
    },
    gw.name,
    routeLabel(role),
  );
  appendEvent(runId, task.id, "task.spawned.adhoc", { role, label: brief.label });
  if (brief.runner === "aion") {
    void runAionWorker(runId, task.id, gw).catch(() => undefined);
  } else if (!executing.has(runId)) {
    void executeRun(runId, gw).catch(() => undefined);
  }
  return { ok: true, run: snapshot(runId)!, taskId: task.id, brief };
}

export function spawnSwarmTask(input: {
  runId?: string;
  role?: string;
  objective: string;
  dependsOn?: string[];
  urls?: string[];
  context?: string;
  tools?: unknown;
  successCriteria?: unknown;
  label?: string;
  runner?: "local" | "aion";
  gateway?: ModelGateway;
}): { ok: true; run: PublicSwarmRun; taskId: string } | { ok: false; error: string } {
  const spawned = spawnEphemeralAgent({
    goal: input.objective,
    runId: input.runId,
    role: input.role,
    preset: input.role,
    dependsOn: input.dependsOn,
    urls: input.urls,
    context: input.context,
    tools: input.tools,
    successCriteria: input.successCriteria,
    label: input.label,
    runner: input.runner,
    gateway: input.gateway,
  });
  if (!spawned.ok) return spawned;
  return { ok: true, run: spawned.run, taskId: spawned.taskId };
}

export function stopSwarmTask(input: {
  runId: string;
  taskId: string;
}): { ok: true; run: PublicSwarmRun | null; taskId: string } | { ok: false; error: string } {
  const runId = String(input.runId || "").trim();
  const taskId = String(input.taskId || "").trim();
  if (!runId || !taskId) return { ok: false, error: "runId and taskId are required" };
  if (!getRun(runId)) return { ok: false, error: "Unknown run" };
  const task = cancelOneTask(runId, taskId);
  if (!task) return { ok: false, error: "Unknown task" };
  return { ok: true, run: snapshot(runId), taskId };
}

export function cleanupSwarm(input: {
  runId: string;
  taskId?: string;
  deleteRun?: boolean;
}): { ok: true; run: PublicSwarmRun | null; deleted?: boolean } | { ok: false; error: string } {
  const runId = String(input.runId || "").trim();
  if (!runId) return { ok: false, error: "runId is required" };
  const run = getRun(runId);
  if (!run) return { ok: false, error: "Unknown run" };
  if (input.taskId) {
    const task = cleanupTask(runId, String(input.taskId));
    if (!task) return { ok: false, error: "Unknown task" };
    return { ok: true, run: snapshot(runId) };
  }
  for (const task of getTasks(runId)) {
    if (task.brief?.ephemeral !== false) cleanupTask(runId, task.id);
  }
  if (input.deleteRun || (run.limits.mode === "led" && ["completed", "failed", "cancelled"].includes(run.status))) {
    deleteRunRecord(runId);
    return { ok: true, run: null, deleted: true };
  }
  return { ok: true, run: snapshot(runId) };
}

async function runAionWorker(runId: string, taskId: string, gateway: ModelGateway) {
  const task = getTask(runId, taskId);
  if (!task) return;
  patchTask(runId, taskId, { state: "running", startedAt: Date.now(), model: "aion-brain" });
  appendEvent(runId, taskId, "task.started", { role: task.role, via: "aion" });
  try {
    const { aionExecute, aionAcceptanceForGoal, isAionConfigured } = await import("@/lib/claw/aion");
    if (!isAionConfigured()) throw new Error("Aion-Brain is not configured (set AION_API_KEY; AION_BASE_URL defaults to the in-app brain).");
    const acceptance = (task.brief?.successCriteria || []).map((description, i) => ({
      id: `c${i + 1}`,
      description,
    }));
    const ran = await aionExecute({
      goal: [task.objective, task.brief?.context ? `Context: ${task.brief.context}` : ""].filter(Boolean).join("\n\n"),
      acceptance: acceptance.length ? acceptance : aionAcceptanceForGoal(task.objective),
      sessionId: `swarm:${runId}:${taskId}`,
      maxCycles: 8,
    });
    const text = [
      ran.answer,
      ran.previous_tool_results.length
        ? `previous_tool_results: ${JSON.stringify(ran.previous_tool_results)}`
        : "",
    ].filter(Boolean).join("\n\n");
    patchTask(runId, taskId, {
      state: ran.status === "BLOCKED" ? "failed" : "completed",
      result: text || ran.status,
      evidence: ran.previous_tool_results.map((r) => `${r.name}:${r.ok}:${r.preview || r.evidence_id || ""}`),
      provider: "aion-brain",
      model: "aion-brain",
      completedAt: Date.now(),
      error: ran.status === "BLOCKED" ? "Aion execute blocked" : null,
    });
    saveTaskResult(runId, taskId, ran.status === "BLOCKED" ? "failed" : "succeeded", text, ran);
    appendEvent(runId, taskId, ran.status === "BLOCKED" ? "task.failed" : "task.completed", { role: task.role, via: "aion" });
  } catch (e) {
    const message = e instanceof Error ? e.message : "aion worker failed";
    patchTask(runId, taskId, { state: "failed", error: message, completedAt: Date.now() });
    appendEvent(runId, taskId, "task.failed", { error: message, via: "aion" });
  }
  void gateway;
}

export async function waitSwarmTask(input: {
  runId: string;
  taskId: string;
  timeoutMs?: number;
}): Promise<{ ok: true; task: ReturnType<typeof getTasks>[number] | undefined; run: PublicSwarmRun | null } | { ok: false; error: string }> {
  const runId = String(input.runId || "").trim();
  const taskId = String(input.taskId || "").trim();
  if (!runId || !taskId) return { ok: false, error: "runId and taskId are required" };
  const timeout = Math.min(90_000, Math.max(1_000, Number(input.timeoutMs) || 45_000));
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const task = getTasks(runId).find((t) => t.id === taskId);
    if (!task) return { ok: false, error: "Unknown task" };
    if (task.state === "completed" || task.state === "failed" || task.state === "cancelled") {
      return { ok: true, task, run: snapshot(runId) };
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return { ok: true, task: getTasks(runId).find((t) => t.id === taskId), run: snapshot(runId) };
}

export function messageSwarm(input: {
  runId: string;
  body: string;
  taskId?: string;
}): { ok: true; run: PublicSwarmRun | null } | { ok: false; error: string } {
  const runId = String(input.runId || "").trim();
  const body = String(input.body || "").trim();
  if (!runId || !body) return { ok: false, error: "runId and body are required" };
  if (!getRun(runId)) return { ok: false, error: "Unknown run" };
  postMessage(runId, body, "claw", input.taskId ? String(input.taskId) : null);
  return { ok: true, run: snapshot(runId) };
}

export function completeSwarm(input: { runId: string; answer?: string }): PublicSwarmRun | null {
  const run = getRun(input.runId);
  if (!run) return null;
  const answer = String(input.answer || run.leaderAnswer || "").trim();
  patchRun(run.id, {
    status: "completed",
    leaderAnswer: answer || "Claw closed the swarm without a synthesizer output.",
    completedAt: Date.now(),
  });
  appendEvent(run.id, null, "run.completed", {});
  getController(run.id)?.abort();
  return snapshot(run.id);
}

let resumed = false;
export function resumeOpenSwarm(gateway?: ModelGateway) {
  recoverExpiredLeases();
  void hydrateSwarmFromPg().catch(() => undefined);
  try {
    const gw = gateway ?? productionGateway();
    if (!gw.available) return;
    for (const run of listOpenRuns()) {
      void executeRun(run.id, gw).catch(() => undefined);
    }
    resumed = true;
  } catch {
    resumed = false;
  }
}

export async function executeRun(runId: string, gateway: ModelGateway) {
  if (executing.has(runId)) return;
  executing.add(runId);
  try {
    const run = getRun(runId);
    if (!run) return;
    const signal = getController(runId)?.signal;
    const led = run.limits.mode === "led";
    if (!led) {
      patchRun(runId, { status: "planning" });
      appendEvent(runId, null, "planning.started", {});

      const planned = await planTasks({ objective: run.objective, limits: run.limits, gateway, signal });
      const usage0 = addUsage(run.usage, {
        promptTokens: planned.usage?.promptTokens ?? 0,
        completionTokens: planned.usage?.completionTokens ?? 0,
        calls: planned.via === "planner" ? 1 : 0,
      });
      patchRun(runId, { usage: usage0 });
      seedTasks(runId, planned.tasks, gateway.name, planned.model || (planned.via === "planner" ? "planner" : "fallback-plan"));
      appendEvent(runId, null, "planning.done", { via: planned.via, error: planned.error ?? null, count: planned.tasks.length });

      if (signal?.aborted) {
        markCancelled(runId);
        return;
      }
    } else {
      appendEvent(runId, null, "led.started", {});
    }

    patchRun(runId, { status: "running" });
    let fetchesLeft = run.limits.maxFetches;

    while (true) {
      recoverExpiredLeases();
      const current = getRun(runId);
      if (!current) return;
      if (current.status === "completed") return;
      if (current.status === "cancelled" || current.status === "cancelling" || signal?.aborted) {
        if (getRun(runId)?.status === "completed") return;
        markCancelled(runId);
        return;
      }
      if (Date.now() > current.deadlineAt) {
        patchRun(runId, { status: "failed", error: "Deadline reached", completedAt: Date.now() });
        appendEvent(runId, null, "run.failed", { error: "Deadline reached" });
        return;
      }
      const over = budgetExceeded(current.usage, current.limits);
      if (over) {
        patchRun(runId, { status: "failed", error: over, completedAt: Date.now() });
        appendEvent(runId, null, "run.failed", { error: over });
        return;
      }

      const ready = readyTasks(runId);
      const open = getTasks(runId).filter((t) => t.state === "pending" || t.state === "ready" || t.state === "leased" || t.state === "running");
      const led = (getRun(runId)?.limits.mode ?? "auto") === "led";
      if (ready.length === 0 && open.length === 0) {
        const synth = getTasks(runId).find((t) => t.role === "synthesizer" && t.state === "completed");
        if (synth?.result) {
          patchRun(runId, { status: "completed", leaderAnswer: synth.result, completedAt: Date.now() });
          appendEvent(runId, synth.id, "run.completed", {});
          return;
        }
        if (led) {
          await new Promise((r) => setTimeout(r, 400));
          continue;
        }
        break;
      }
      if (ready.length === 0) {
        const stuck = getTasks(runId).filter((t) => t.state === "leased" || t.state === "running");
        if (stuck.length === 0) break;
        await new Promise((r) => setTimeout(r, 200));
        continue;
      }

      const batch = ready.filter((t) => t.role !== "synthesizer");
      const synths = ready.filter((t) => t.role === "synthesizer");
      const work = batch.length ? batch : synths;
      if (work.some((t) => t.role === "synthesizer")) patchRun(runId, { status: "synthesizing" });

      await Promise.all(
        work.map(async (task) => {
          const live = getRun(runId);
          if (!live || live.status === "cancelled" || live.status === "cancelling" || signal?.aborted) return;
          if (task.brief?.runner === "aion") return;
          const owner = `web-${process.pid}-${task.id}`;
          if (!claimTask(runId, task.id, owner)) return;
          heartbeatTask(runId, task.id);
          const taskSignal = getTaskController(runId, task.id).signal;
          const combined = signal ? AbortSignal.any([signal, taskSignal]) : taskSignal;
          patchTask(runId, task.id, {
            state: "running",
            attempt: task.attempt + 1,
            startedAt: Date.now(),
            model: routeLabel(task.role),
          });
          appendEvent(runId, task.id, "task.started", { role: task.role });
          try {
            const siblings = getTasks(runId);
            const upstream = [
              collectUpstream(task, siblings),
              listMessages(runId, task.id)
                .map((m) => `MESSAGE from ${m.fromRole}: ${m.body}`)
                .join("\n"),
            ]
              .filter(Boolean)
              .join("\n\n");
            const result = await runWorker({
              task: { ...getTask(runId, task.id)!, attempt: task.attempt + 1 },
              upstream,
              gateway,
              remainingFetches: fetchesLeft,
              signal: combined,
            });
            fetchesLeft = Math.max(0, fetchesLeft - result.fetchesUsed);
            const latest = getRun(runId)!;
            patchRun(runId, { usage: addUsage(latest.usage, { ...result.usage, calls: 1 }) });
            patchTask(runId, task.id, {
              state: "completed",
              result: result.text,
              evidence: result.evidence,
              provider: result.provider,
              model: result.model,
              usage: addUsage(task.usage, { ...result.usage, calls: 1 }),
              completedAt: Date.now(),
              error: null,
            });
            appendEvent(runId, task.id, "task.completed", { role: task.role, model: result.model });
            saveTaskResult(runId, task.id, "succeeded", result.text, result.usage);
            if (task.role === "synthesizer") {
              patchRun(runId, { leaderAnswer: result.text });
            }
          } catch (e) {
            const message = e instanceof Error ? e.message : "worker failed";
            if (signal?.aborted || taskSignal.aborted || getTask(runId, task.id)?.state === "cancelled") {
              patchTask(runId, task.id, { state: "cancelled", error: "Stopped", completedAt: Date.now() });
              abortTaskController(runId, task.id);
              return;
            }
            const attempt = task.attempt + 1;
            if (attempt < (getRun(runId)?.limits.maxAttempts ?? 1)) {
              patchTask(runId, task.id, { state: "ready", attempt, error: message });
              appendEvent(runId, task.id, "task.retry", { error: message, attempt });
            } else {
              patchTask(runId, task.id, { state: "failed", attempt, error: message, completedAt: Date.now() });
              appendEvent(runId, task.id, "task.failed", { error: message });
            }
          }
        }),
      );
    }

    const final = getRun(runId);
    if (!final || final.status === "cancelled") return;
    const synth = getTasks(runId).find((t) => t.role === "synthesizer" && t.state === "completed");
    if (synth?.result) {
      patchRun(runId, { status: "completed", leaderAnswer: synth.result, completedAt: Date.now() });
      appendEvent(runId, synth.id, "run.completed", {});
      return;
    }
    const failed = getTasks(runId).filter((t) => t.state === "failed");
    patchRun(runId, {
      status: "failed",
      error: failed[0]?.error || "Leader did not complete",
      completedAt: Date.now(),
    });
    appendEvent(runId, null, "run.failed", { error: failed[0]?.error || "Leader did not complete" });
  } finally {
    executing.delete(runId);
  }
}
