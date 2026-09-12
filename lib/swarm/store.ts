import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { emptyUsage } from "./policy";
import { queueSwarmMirror } from "./pg-mirror";
import type { PlannedTask, PublicSwarmRun, SwarmEvent, SwarmLimits, SwarmMessage, SwarmRun, SwarmTask, TaskBrief } from "./types";

const controllers = new Map<string, AbortController>();
const taskControllers = new Map<string, AbortController>();

function taskAbortKey(runId: string, taskId: string) {
  return `${runId}:${taskId}`;
}

db.exec(`
CREATE TABLE IF NOT EXISTS swarm_runs (
  id TEXT PRIMARY KEY,
  objective TEXT NOT NULL,
  status TEXT NOT NULL,
  limits_json TEXT NOT NULL,
  deadline_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER,
  leader_answer TEXT,
  error TEXT,
  usage_json TEXT NOT NULL,
  provider_note TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS swarm_tasks (
  id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  parent_id TEXT,
  role TEXT NOT NULL,
  objective TEXT NOT NULL,
  depends_json TEXT NOT NULL,
  urls_json TEXT NOT NULL,
  state TEXT NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 0,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  result TEXT,
  evidence_json TEXT NOT NULL,
  error TEXT,
  usage_json TEXT NOT NULL,
  started_at INTEGER,
  completed_at INTEGER,
  PRIMARY KEY (run_id, id),
  FOREIGN KEY (run_id) REFERENCES swarm_runs(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS swarm_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  task_id TEXT,
  type TEXT NOT NULL,
  at INTEGER NOT NULL,
  data_json TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES swarm_runs(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_swarm_runs_created ON swarm_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_swarm_events_run ON swarm_events(run_id, at);
CREATE TABLE IF NOT EXISTS swarm_messages (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  task_id TEXT,
  from_role TEXT NOT NULL,
  body TEXT NOT NULL,
  at INTEGER NOT NULL,
  FOREIGN KEY (run_id) REFERENCES swarm_runs(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS swarm_task_results (
  task_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  status TEXT NOT NULL,
  summary TEXT NOT NULL,
  findings_json TEXT NOT NULL,
  artifacts_json TEXT NOT NULL,
  usage_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (run_id, task_id)
);
`);

try { db.exec("ALTER TABLE swarm_tasks ADD COLUMN lease_owner TEXT"); } catch { /* exists */ }
try { db.exec("ALTER TABLE swarm_tasks ADD COLUMN lease_until INTEGER"); } catch { /* exists */ }
try { db.exec("ALTER TABLE swarm_tasks ADD COLUMN brief_json TEXT"); } catch { /* exists */ }
try { db.exec("ALTER TABLE swarm_tasks ADD COLUMN cleaned_up_at INTEGER"); } catch { /* exists */ }

type RunRow = {
  id: string;
  objective: string;
  status: SwarmRun["status"];
  limits_json: string;
  deadline_at: number;
  created_at: number;
  updated_at: number;
  completed_at: number | null;
  leader_answer: string | null;
  error: string | null;
  usage_json: string;
  provider_note: string;
};

type TaskRow = {
  id: string;
  run_id: string;
  parent_id: string | null;
  role: SwarmTask["role"];
  objective: string;
  depends_json: string;
  urls_json: string;
  state: SwarmTask["state"];
  attempt: number;
  provider: string;
  model: string;
  result: string | null;
  evidence_json: string;
  error: string | null;
  usage_json: string;
  started_at: number | null;
  completed_at: number | null;
  brief_json?: string | null;
  cleaned_up_at?: number | null;
};

function parseBrief(raw: string | null | undefined): TaskBrief | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as TaskBrief;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function now() {
  return Date.now();
}

function nid(prefix: string) {
  return `${prefix}_${randomUUID().slice(0, 8)}${Date.now().toString(36).slice(-4)}`;
}

function runFromRow(row: RunRow): SwarmRun {
  return {
    id: row.id,
    objective: row.objective,
    status: row.status,
    limits: JSON.parse(row.limits_json),
    deadlineAt: row.deadline_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    leaderAnswer: row.leader_answer,
    error: row.error,
    usage: JSON.parse(row.usage_json),
    providerNote: row.provider_note,
  };
}

function taskFromRow(row: TaskRow): SwarmTask {
  return {
    id: row.id,
    runId: row.run_id,
    parentId: row.parent_id,
    role: row.role,
    objective: row.objective,
    dependsOn: JSON.parse(row.depends_json),
    urls: JSON.parse(row.urls_json),
    state: row.state,
    attempt: row.attempt,
    provider: row.provider,
    model: row.model,
    result: row.result,
    evidence: JSON.parse(row.evidence_json),
    error: row.error,
    usage: JSON.parse(row.usage_json),
    startedAt: row.started_at,
    completedAt: row.completed_at,
    brief: parseBrief(row.brief_json),
    cleanedUpAt: row.cleaned_up_at ?? null,
  };
}

export function activeRunCount(): number {
  const row = db.prepare(
    `SELECT COUNT(*) AS n FROM swarm_runs WHERE status IN ('queued','planning','running','synthesizing','cancelling')`,
  ).get() as { n: number };
  return row.n;
}

export function createRunRecord(objective: string, limits: SwarmLimits, providerNote: string): SwarmRun {
  reap();
  const createdAt = now();
  const run: SwarmRun = {
    id: nid("run"),
    objective,
    status: "queued",
    limits,
    deadlineAt: createdAt + limits.deadlineMs,
    createdAt,
    updatedAt: createdAt,
    completedAt: null,
    leaderAnswer: null,
    error: null,
    usage: emptyUsage(),
    providerNote,
  };
  db.prepare(
    `INSERT INTO swarm_runs (id, objective, status, limits_json, deadline_at, created_at, updated_at, completed_at, leader_answer, error, usage_json, provider_note)
     VALUES (@id, @objective, @status, @limits_json, @deadline_at, @created_at, @updated_at, @completed_at, @leader_answer, @error, @usage_json, @provider_note)`,
  ).run({
    id: run.id,
    objective: run.objective,
    status: run.status,
    limits_json: JSON.stringify(run.limits),
    deadline_at: run.deadlineAt,
    created_at: run.createdAt,
    updated_at: run.updatedAt,
    completed_at: run.completedAt,
    leader_answer: run.leaderAnswer,
    error: run.error,
    usage_json: JSON.stringify(run.usage),
    provider_note: run.providerNote,
  });
  controllers.set(run.id, new AbortController());
  appendEvent(run.id, null, "run.created", { objective: objective.slice(0, 240) });
  return run;
}

export function getController(runId: string): AbortController | undefined {
  if (!controllers.has(runId) && getRun(runId)) controllers.set(runId, new AbortController());
  return controllers.get(runId);
}

export function getTaskController(runId: string, taskId: string): AbortController {
  const key = taskAbortKey(runId, taskId);
  const existing = taskControllers.get(key);
  if (existing) return existing;
  const created = new AbortController();
  taskControllers.set(key, created);
  return created;
}

export function abortTaskController(runId: string, taskId: string) {
  const key = taskAbortKey(runId, taskId);
  taskControllers.get(key)?.abort();
  taskControllers.delete(key);
}

export function getRun(runId: string): SwarmRun | undefined {
  const row = db.prepare("SELECT * FROM swarm_runs WHERE id = ?").get(runId) as RunRow | undefined;
  return row ? runFromRow(row) : undefined;
}

export function listRuns(): SwarmRun[] {
  const rows = db.prepare("SELECT * FROM swarm_runs ORDER BY created_at DESC LIMIT 20").all() as RunRow[];
  return rows.map(runFromRow);
}

export function getTasks(runId: string): SwarmTask[] {
  const rows = db.prepare("SELECT * FROM swarm_tasks WHERE run_id = ?").all(runId) as TaskRow[];
  return rows.map(taskFromRow);
}

export function getEvents(runId: string): SwarmEvent[] {
  const rows = db.prepare("SELECT * FROM swarm_events WHERE run_id = ? ORDER BY at ASC").all(runId) as Array<{
    id: string; run_id: string; task_id: string | null; type: string; at: number; data_json: string;
  }>;
  return rows.map((r) => ({
    id: r.id,
    runId: r.run_id,
    taskId: r.task_id,
    type: r.type,
    at: r.at,
    data: JSON.parse(r.data_json),
  }));
}

export function snapshot(runId: string): PublicSwarmRun | null {
  const run = getRun(runId);
  if (!run) return null;
  return {
    ...run,
    tasks: getTasks(runId).map((t) => ({
      id: t.id,
      role: t.role,
      objective: t.objective,
      dependsOn: t.dependsOn,
      state: t.state,
      attempt: t.attempt,
      provider: t.provider,
      model: t.model,
      result: t.result,
      evidence: t.evidence,
      error: t.error,
      usage: t.usage,
      startedAt: t.startedAt,
      completedAt: t.completedAt,
      brief: t.brief,
      cleanedUpAt: t.cleanedUpAt,
    })),
    events: getEvents(runId).slice(-80),
  };
}

export function patchRun(runId: string, patch: Partial<SwarmRun>): SwarmRun {
  const run = getRun(runId);
  if (!run) throw new Error("Unknown run");
  const next = { ...run, ...patch, updatedAt: now() };
  db.prepare(
    `UPDATE swarm_runs SET objective=@objective, status=@status, limits_json=@limits_json, deadline_at=@deadline_at,
     updated_at=@updated_at, completed_at=@completed_at, leader_answer=@leader_answer, error=@error,
     usage_json=@usage_json, provider_note=@provider_note WHERE id=@id`,
  ).run({
    id: next.id,
    objective: next.objective,
    status: next.status,
    limits_json: JSON.stringify(next.limits),
    deadline_at: next.deadlineAt,
    updated_at: next.updatedAt,
    completed_at: next.completedAt,
    leader_answer: next.leaderAnswer,
    error: next.error,
    usage_json: JSON.stringify(next.usage),
    provider_note: next.providerNote,
  });
  return next;
}

export function seedTasks(runId: string, planned: PlannedTask[], provider: string, model: string): SwarmTask[] {
  const insert = db.prepare(
    `INSERT INTO swarm_tasks (id, run_id, parent_id, role, objective, depends_json, urls_json, state, attempt, provider, model, result, evidence_json, error, usage_json, started_at, completed_at, brief_json, cleaned_up_at)
     VALUES (@id, @run_id, @parent_id, @role, @objective, @depends_json, @urls_json, @state, @attempt, @provider, @model, @result, @evidence_json, @error, @usage_json, @started_at, @completed_at, @brief_json, @cleaned_up_at)`,
  );
  const rows: SwarmTask[] = [];
  const tx = db.transaction(() => {
    for (const p of planned) {
      const task: SwarmTask = {
        id: p.id,
        runId,
        parentId: p.dependsOn[0] ?? null,
        role: p.role,
        objective: p.objective,
        dependsOn: p.dependsOn,
        urls: (p.urls ?? []).slice(0, 3),
        state: p.dependsOn.length === 0 ? "ready" : "pending",
        attempt: 0,
        provider,
        model,
        result: null,
        evidence: [],
        error: null,
        usage: emptyUsage(),
        startedAt: null,
        completedAt: null,
        brief: p.brief ?? null,
        cleanedUpAt: null,
      };
      insert.run({
        id: task.id,
        run_id: task.runId,
        parent_id: task.parentId,
        role: task.role,
        objective: task.objective,
        depends_json: JSON.stringify(task.dependsOn),
        urls_json: JSON.stringify(task.urls),
        state: task.state,
        attempt: task.attempt,
        provider: task.provider,
        model: task.model,
        result: task.result,
        evidence_json: JSON.stringify(task.evidence),
        error: task.error,
        usage_json: JSON.stringify(task.usage),
        started_at: task.startedAt,
        completed_at: task.completedAt,
        brief_json: task.brief ? JSON.stringify(task.brief) : null,
        cleaned_up_at: task.cleanedUpAt,
      });
      rows.push(task);
    }
  });
  tx();
  appendEvent(runId, null, "plan.seeded", { count: rows.length, roles: rows.map((r) => r.role) });
  return rows;
}

export function insertTask(runId: string, planned: PlannedTask, provider: string, model: string): SwarmTask {
  const task: SwarmTask = {
    id: planned.id,
    runId,
    parentId: planned.dependsOn[0] ?? null,
    role: planned.role,
    objective: planned.objective,
    dependsOn: planned.dependsOn,
    urls: (planned.urls ?? []).slice(0, 3),
    state: planned.dependsOn.length === 0 ? "ready" : "pending",
    attempt: 0,
    provider,
    model,
    result: null,
    evidence: [],
    error: null,
    usage: emptyUsage(),
    startedAt: null,
    completedAt: null,
    brief: planned.brief ?? null,
    cleanedUpAt: null,
  };
  db.prepare(
    `INSERT INTO swarm_tasks (id, run_id, parent_id, role, objective, depends_json, urls_json, state, attempt, provider, model, result, evidence_json, error, usage_json, started_at, completed_at, brief_json, cleaned_up_at)
     VALUES (@id, @run_id, @parent_id, @role, @objective, @depends_json, @urls_json, @state, @attempt, @provider, @model, @result, @evidence_json, @error, @usage_json, @started_at, @completed_at, @brief_json, @cleaned_up_at)`,
  ).run({
    id: task.id,
    run_id: task.runId,
    parent_id: task.parentId,
    role: task.role,
    objective: task.objective,
    depends_json: JSON.stringify(task.dependsOn),
    urls_json: JSON.stringify(task.urls),
    state: task.state,
    attempt: task.attempt,
    provider: task.provider,
    model: task.model,
    result: task.result,
    evidence_json: JSON.stringify(task.evidence),
    error: task.error,
    usage_json: JSON.stringify(task.usage),
    started_at: task.startedAt,
    completed_at: task.completedAt,
    brief_json: task.brief ? JSON.stringify(task.brief) : null,
    cleaned_up_at: task.cleanedUpAt,
  });
  appendEvent(runId, task.id, "task.spawned", { role: task.role, label: task.brief?.label });
  return task;
}

export function getTask(runId: string, taskId: string): SwarmTask | undefined {
  return getTasks(runId).find((t) => t.id === taskId);
}

export function saveTaskResult(runId: string, taskId: string, status: string, summary: string, usage: unknown) {
  db.prepare(
    `INSERT OR REPLACE INTO swarm_task_results (task_id, run_id, status, summary, findings_json, artifacts_json, usage_json, created_at)
     VALUES (?, ?, ?, ?, '[]', '[]', ?, ?)`,
  ).run(taskId, runId, status, summary.slice(0, 8000), JSON.stringify(usage ?? {}), now());
}

export function postMessage(runId: string, body: string, fromRole = "claw", taskId: string | null = null): SwarmMessage {
  const row: SwarmMessage = { id: nid("msg"), runId, taskId, fromRole, body: body.slice(0, 4000), at: now() };
  db.prepare(
    `INSERT INTO swarm_messages (id, run_id, task_id, from_role, body, at) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(row.id, row.runId, row.taskId, row.fromRole, row.body, row.at);
  appendEvent(runId, taskId, "task.message", { role: fromRole });
  return row;
}

export function listMessages(runId: string, taskId?: string): SwarmMessage[] {
  const rows = (
    taskId
      ? db.prepare(
          `SELECT * FROM swarm_messages WHERE run_id = ? AND (task_id IS NULL OR task_id = ?) ORDER BY at ASC`,
        ).all(runId, taskId)
      : db.prepare(`SELECT * FROM swarm_messages WHERE run_id = ? ORDER BY at ASC`).all(runId)
  ) as Array<{
    id: string; run_id: string; task_id: string | null; from_role: string; body: string; at: number;
  }>;
  return rows.map((r) => ({
    id: r.id,
    runId: r.run_id,
    taskId: r.task_id,
    fromRole: r.from_role,
    body: r.body,
    at: r.at,
  }));
}

export function listOpenRuns(): SwarmRun[] {
  return listRuns().filter((r) =>
    r.status === "queued" || r.status === "planning" || r.status === "running" || r.status === "synthesizing",
  );
}

export function patchTask(runId: string, taskId: string, patch: Partial<SwarmTask>): SwarmTask {
  const current = getTasks(runId).find((t) => t.id === taskId);
  if (!current) throw new Error("Unknown task");
  const next = { ...current, ...patch };
  db.prepare(
    `UPDATE swarm_tasks SET parent_id=@parent_id, role=@role, objective=@objective, depends_json=@depends_json,
     urls_json=@urls_json, state=@state, attempt=@attempt, provider=@provider, model=@model, result=@result,
     evidence_json=@evidence_json, error=@error, usage_json=@usage_json, started_at=@started_at, completed_at=@completed_at,
     brief_json=@brief_json, cleaned_up_at=@cleaned_up_at
     WHERE run_id=@run_id AND id=@id`,
  ).run({
    id: next.id,
    run_id: next.runId,
    parent_id: next.parentId,
    role: next.role,
    objective: next.objective,
    depends_json: JSON.stringify(next.dependsOn),
    urls_json: JSON.stringify(next.urls),
    state: next.state,
    attempt: next.attempt,
    provider: next.provider,
    model: next.model,
    result: next.result,
    evidence_json: JSON.stringify(next.evidence),
    error: next.error,
    usage_json: JSON.stringify(next.usage),
    started_at: next.startedAt,
    completed_at: next.completedAt,
    brief_json: next.brief ? JSON.stringify(next.brief) : null,
    cleaned_up_at: next.cleanedUpAt,
  });
  return next;
}

export function cancelOneTask(runId: string, taskId: string, reason = "Operator stopped"): SwarmTask | undefined {
  const task = getTask(runId, taskId);
  if (!task) return undefined;
  abortTaskController(runId, taskId);
  if (["completed", "failed", "cancelled"].includes(task.state)) return task;
  const next = patchTask(runId, taskId, { state: "cancelled", error: reason, completedAt: now() });
  appendEvent(runId, taskId, "task.stopped", { role: task.role, reason });
  return next;
}

export function cleanupTask(runId: string, taskId: string): SwarmTask | undefined {
  const task = getTask(runId, taskId);
  if (!task) return undefined;
  if (!["completed", "failed", "cancelled"].includes(task.state)) {
    cancelOneTask(runId, taskId, "Cleanup requested");
  }
  abortTaskController(runId, taskId);
  const live = getTask(runId, taskId);
  if (!live) return undefined;
  const next = patchTask(runId, taskId, {
    evidence: [],
    cleanedUpAt: now(),
  });
  appendEvent(runId, taskId, "task.cleaned", { role: live.role });
  return next;
}

export function deleteRunRecord(runId: string) {
  abortTaskControllersForRun(runId);
  controllers.get(runId)?.abort();
  controllers.delete(runId);
  db.prepare("DELETE FROM swarm_messages WHERE run_id = ?").run(runId);
  db.prepare("DELETE FROM swarm_events WHERE run_id = ?").run(runId);
  db.prepare("DELETE FROM swarm_task_results WHERE run_id = ?").run(runId);
  db.prepare("DELETE FROM swarm_tasks WHERE run_id = ?").run(runId);
  db.prepare("DELETE FROM swarm_runs WHERE id = ?").run(runId);
}

function abortTaskControllersForRun(runId: string) {
  for (const key of [...taskControllers.keys()]) {
    if (key.startsWith(`${runId}:`)) {
      taskControllers.get(key)?.abort();
      taskControllers.delete(key);
    }
  }
}

export function claimTask(runId: string, taskId: string, owner: string, ttlMs = 45_000): boolean {
  const until = Date.now() + ttlMs;
  const nowMs = Date.now();
  const res = db.prepare(
    `UPDATE swarm_tasks SET state='leased', lease_owner=?, lease_until=?
     WHERE run_id=? AND id=? AND (
       state IN ('ready','pending')
       OR (state IN ('leased','running') AND (lease_until IS NULL OR lease_until < ?))
     )`,
  ).run(owner, until, runId, taskId, nowMs);
  return res.changes > 0;
}

export function heartbeatTask(runId: string, taskId: string, ttlMs = 45_000) {
  db.prepare(
    `UPDATE swarm_tasks SET lease_until=? WHERE run_id=? AND id=? AND state IN ('leased','running')`,
  ).run(Date.now() + ttlMs, runId, taskId);
}

export function recoverExpiredLeases() {
  const n = Date.now();
  db.prepare(
    `UPDATE swarm_tasks SET state='ready', lease_owner=NULL, lease_until=NULL
     WHERE state IN ('leased','running') AND lease_until IS NOT NULL AND lease_until < ?`,
  ).run(n);
}

export function readyTasks(runId: string): SwarmTask[] {
  const rows = getTasks(runId);
  const done = new Set(rows.filter((t) => t.state === "completed").map((t) => t.id));
  const failed = new Set(rows.filter((t) => t.state === "failed" || t.state === "cancelled").map((t) => t.id));
  const out: SwarmTask[] = [];
  for (const task of rows) {
    if (task.state !== "pending" && task.state !== "ready") continue;
    if (task.dependsOn.some((id) => failed.has(id))) {
      patchTask(runId, task.id, { state: "cancelled", error: "Upstream task failed", completedAt: now() });
      continue;
    }
    if (task.dependsOn.every((id) => done.has(id))) {
      if (task.state === "pending") patchTask(runId, task.id, { state: "ready" });
      out.push(getTasks(runId).find((t) => t.id === task.id)!);
    }
  }
  return out;
}

export function appendEvent(runId: string, taskId: string | null, type: string, data: SwarmEvent["data"] = {}) {
  db.prepare(
    `INSERT INTO swarm_events (id, run_id, task_id, type, at, data_json) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(nid("evt"), runId, taskId, type, now(), JSON.stringify(data));
  db.prepare("UPDATE swarm_runs SET updated_at = ? WHERE id = ?").run(now(), runId);
  queueSwarmMirror();
}

export function markCancelled(runId: string, reason = "Cancelled") {
  abortTaskControllersForRun(runId);
  controllers.get(runId)?.abort();
  const run = getRun(runId);
  if (!run) return;
  for (const task of getTasks(runId)) {
    if (task.state === "pending" || task.state === "ready" || task.state === "leased" || task.state === "running") {
      patchTask(runId, task.id, { state: "cancelled", error: reason, completedAt: now() });
    }
  }
  patchRun(runId, { status: "cancelled", error: reason, completedAt: now() });
  appendEvent(runId, null, "run.cancelled", { reason });
}

function reap() {
  const cutoff = now() - 2 * 60 * 60 * 1000;
  const old = db.prepare(
    `SELECT id FROM swarm_runs WHERE completed_at IS NOT NULL AND completed_at < ?`,
  ).all(cutoff) as Array<{ id: string }>;
  const del = db.transaction(() => {
    for (const row of old) {
      db.prepare("DELETE FROM swarm_events WHERE run_id = ?").run(row.id);
      db.prepare("DELETE FROM swarm_tasks WHERE run_id = ?").run(row.id);
      db.prepare("DELETE FROM swarm_runs WHERE id = ?").run(row.id);
      controllers.delete(row.id);
    }
  });
  del();
}

export function swarmStoreStatus() {
  return {
    live: true,
    active: activeRunCount(),
    stored: (db.prepare("SELECT COUNT(*) AS n FROM swarm_runs").get() as { n: number }).n,
    transport: process.env.DATABASE_URL ? "postgres mirror + sqlite working set" : "sqlite durable tasks",
  };
}
