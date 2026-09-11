import { productionGateway, routeLabel } from "./gateway";
import { addUsage, budgetExceeded, parseLimits, sanitizeObjective, SWARM_MAX_CONCURRENT_RUNS } from "./policy";
import { planTasks } from "./planner";
import {
  activeRunCount,
  appendEvent,
  claimTask,
  createRunRecord,
  getController,
  getRun,
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
    note: "Computer keeps its Chrome. Forge keeps its lab. Swarm is planner + workers + leader.",
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

const WORKER_ROLES = ["researcher", "critic", "synthesizer"] as const;

export function spawnSwarmTask(input: {
  runId?: string;
  role?: string;
  objective: string;
  dependsOn?: string[];
  urls?: string[];
  gateway?: ModelGateway;
}): { ok: true; run: PublicSwarmRun; taskId: string } | { ok: false; error: string } {
  const objective = sanitizeObjective(input.objective);
  if (!objective.ok) return objective;
  const roleRaw = String(input.role || "researcher").toLowerCase();
  const role = (WORKER_ROLES as readonly string[]).includes(roleRaw) ? (roleRaw as (typeof WORKER_ROLES)[number]) : "researcher";
  const gw = input.gateway ?? productionGateway();
  if (!gw.available) return { ok: false, error: gw.note };

  let runId = String(input.runId || "").trim();
  if (!runId) {
    if (activeRunCount() >= SWARM_MAX_CONCURRENT_RUNS) {
      return { ok: false, error: "A swarm is already running. Spawn onto that runId or cancel it." };
    }
    const run = createRunRecord(objective.objective, parseLimits({ mode: "led", maxAgents: 4 }), gw.note);
    runId = run.id;
    void executeRun(runId, gw).catch((e) => {
      const message = e instanceof Error ? e.message : "swarm failed";
      try {
        patchRun(runId, { status: "failed", error: message, completedAt: Date.now() });
        appendEvent(runId, null, "run.failed", { error: message });
      } catch {
        /* gone */
      }
    });
  }

  const live = getRun(runId);
  if (!live) return { ok: false, error: "Unknown run" };
  if (["completed", "failed", "cancelled"].includes(live.status)) {
    return { ok: false, error: "Run is closed. Start a new swarm." };
  }
  const existing = getTasks(runId);
  if (existing.length >= live.limits.maxAgents) {
    return { ok: false, error: `max agents (${live.limits.maxAgents}) reached` };
  }
  const task = insertTask(
    runId,
    {
      id: nid(role.slice(0, 3)),
      role,
      objective: objective.objective,
      dependsOn: Array.isArray(input.dependsOn) ? input.dependsOn.map(String).slice(0, 4) : [],
      urls: Array.isArray(input.urls) ? input.urls.map(String).slice(0, 3) : [],
    },
    gw.name,
    routeLabel(role),
  );
  if (!executing.has(runId)) {
    void executeRun(runId, gw).catch(() => undefined);
  }
  return { ok: true, run: snapshot(runId)!, taskId: task.id };
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
          const owner = `web-${process.pid}-${task.id}`;
          if (!claimTask(runId, task.id, owner)) return;
          heartbeatTask(runId, task.id);
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
              task: { ...task, attempt: task.attempt + 1 },
              upstream,
              gateway,
              remainingFetches: fetchesLeft,
              signal,
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
            if (signal?.aborted) {
              patchTask(runId, task.id, { state: "cancelled", error: "Cancelled", completedAt: Date.now() });
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
