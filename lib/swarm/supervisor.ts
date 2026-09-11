import { productionGateway, routeLabel } from "./gateway";
import { addUsage, budgetExceeded, parseLimits, sanitizeObjective, SWARM_MAX_CONCURRENT_RUNS } from "./policy";
import { planTasks } from "./planner";
import {
  activeRunCount,
  appendEvent,
  createRunRecord,
  getController,
  getRun,
  getTasks,
  listRuns,
  markCancelled,
  patchRun,
  patchTask,
  readyTasks,
  seedTasks,
  snapshot,
  swarmStoreStatus,
} from "./store";
import { collectUpstream, runWorker } from "./worker";
import type { ModelGateway, PublicSwarmRun, SwarmLimits } from "./types";
import { SWARM_CONTRACT } from "./types";

const executing = new Set<string>();

export function swarmStatus(gateway?: ModelGateway) {
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

export async function executeRun(runId: string, gateway: ModelGateway) {
  if (executing.has(runId)) return;
  executing.add(runId);
  try {
    const run = getRun(runId);
    if (!run) return;
    const signal = getController(runId)?.signal;
    patchRun(runId, { status: "planning" });
    appendEvent(runId, null, "planning.started", {});

    const planned = await planTasks({ objective: run.objective, limits: run.limits, gateway, signal });
    const usage0 = addUsage(run.usage, { promptTokens: 0, completionTokens: 0, calls: planned.via === "planner" ? 1 : 0 });
    patchRun(runId, { usage: usage0 });
    seedTasks(runId, planned.tasks, gateway.name, planned.via === "planner" ? "planner" : "fallback-plan");
    appendEvent(runId, null, "planning.done", { via: planned.via, error: planned.error ?? null, count: planned.tasks.length });

    if (signal?.aborted) {
      markCancelled(runId);
      return;
    }

    patchRun(runId, { status: "running" });
    let fetchesLeft = run.limits.maxFetches;

    while (true) {
      const current = getRun(runId);
      if (!current) return;
      if (current.status === "cancelled" || current.status === "cancelling" || signal?.aborted) {
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
      if (ready.length === 0 && open.length === 0) break;
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
          patchTask(runId, task.id, {
            state: "running",
            attempt: task.attempt + 1,
            startedAt: Date.now(),
            model: routeLabel(task.role),
          });
          appendEvent(runId, task.id, "task.started", { role: task.role });
          try {
            const siblings = getTasks(runId);
            const upstream = collectUpstream(task, siblings);
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
