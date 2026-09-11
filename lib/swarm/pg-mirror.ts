import { db } from "@/lib/db";

type Sql = {
  unsafe: (q: string, args?: unknown[]) => Promise<unknown>;
  end: (opts?: { timeout: number }) => Promise<void>;
} & ((strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>);

let sql: Sql | null = null;
let mirroring = false;
let queued = false;

export function swarmDatabaseUrl(): string | null {
  return process.env.DATABASE_URL || process.env.VECTOR_DATABASE_URL || null;
}

async function getSql(): Promise<Sql | null> {
  const url = swarmDatabaseUrl();
  if (!url) return null;
  if (sql) return sql;
  const postgres = (await import("postgres")).default;
  sql = postgres(url, { ssl: "require", onnotice: () => {}, max: 2, idle_timeout: 20 }) as unknown as Sql;
  return sql;
}

export async function ensureSwarmPg(): Promise<boolean> {
  const client = await getSql();
  if (!client) return false;
  await client.unsafe(`
CREATE TABLE IF NOT EXISTS swarm_runs (
  id TEXT PRIMARY KEY,
  objective TEXT NOT NULL,
  status TEXT NOT NULL,
  limits_json TEXT NOT NULL,
  deadline_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  completed_at BIGINT,
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
  started_at BIGINT,
  completed_at BIGINT,
  lease_owner TEXT,
  lease_until BIGINT,
  PRIMARY KEY (run_id, id)
);
CREATE TABLE IF NOT EXISTS swarm_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  task_id TEXT,
  type TEXT NOT NULL,
  at BIGINT NOT NULL,
  data_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS swarm_messages (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  task_id TEXT,
  from_role TEXT NOT NULL,
  body TEXT NOT NULL,
  at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pg_swarm_runs_created ON swarm_runs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pg_swarm_events_run ON swarm_events (run_id, at);
CREATE INDEX IF NOT EXISTS idx_pg_swarm_tasks_lease ON swarm_tasks (state, lease_until);
`);
  return true;
}

export function queueSwarmMirror() {
  if (!swarmDatabaseUrl() || queued) return;
  queued = true;
  void flushMirror().finally(() => {
    queued = false;
  });
}

async function flushMirror() {
  if (mirroring) return;
  mirroring = true;
  try {
    const client = await getSql();
    if (!client) return;
    await ensureSwarmPg();
    const runs = db.prepare("SELECT * FROM swarm_runs ORDER BY created_at DESC LIMIT 40").all() as Array<Record<string, unknown>>;
    for (const run of runs) {
      await client.unsafe(
        `INSERT INTO swarm_runs (id, objective, status, limits_json, deadline_at, created_at, updated_at, completed_at, leader_answer, error, usage_json, provider_note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (id) DO UPDATE SET
           status = EXCLUDED.status,
           limits_json = EXCLUDED.limits_json,
           deadline_at = EXCLUDED.deadline_at,
           updated_at = EXCLUDED.updated_at,
           completed_at = EXCLUDED.completed_at,
           leader_answer = EXCLUDED.leader_answer,
           error = EXCLUDED.error,
           usage_json = EXCLUDED.usage_json,
           provider_note = EXCLUDED.provider_note`,
        [
          run.id, run.objective, run.status, run.limits_json, run.deadline_at, run.created_at,
          run.updated_at, run.completed_at, run.leader_answer, run.error, run.usage_json, run.provider_note,
        ],
      );
    }
    const tasks = db.prepare("SELECT * FROM swarm_tasks").all() as Array<Record<string, unknown>>;
    for (const task of tasks) {
      await client.unsafe(
        `INSERT INTO swarm_tasks (id, run_id, parent_id, role, objective, depends_json, urls_json, state, attempt, provider, model, result, evidence_json, error, usage_json, started_at, completed_at, lease_owner, lease_until)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
         ON CONFLICT (run_id, id) DO UPDATE SET
           state = EXCLUDED.state, attempt = EXCLUDED.attempt, result = EXCLUDED.result,
           evidence_json = EXCLUDED.evidence_json, error = EXCLUDED.error, usage_json = EXCLUDED.usage_json,
           started_at = EXCLUDED.started_at, completed_at = EXCLUDED.completed_at,
           lease_owner = EXCLUDED.lease_owner, lease_until = EXCLUDED.lease_until,
           model = EXCLUDED.model, provider = EXCLUDED.provider`,
        [
          task.id, task.run_id, task.parent_id, task.role, task.objective, task.depends_json, task.urls_json,
          task.state, task.attempt, task.provider, task.model, task.result, task.evidence_json, task.error,
          task.usage_json, task.started_at, task.completed_at, task.lease_owner ?? null, task.lease_until ?? null,
        ],
      );
    }
  } catch {
    /* postgres optional at runtime */
  } finally {
    mirroring = false;
  }
}

export async function hydrateSwarmFromPg(): Promise<number> {
  const client = await getSql();
  if (!client) return 0;
  await ensureSwarmPg();
  const local = (db.prepare("SELECT COUNT(*) AS n FROM swarm_runs").get() as { n: number }).n;
  if (local > 0) return 0;
  const rows = (await client.unsafe("SELECT * FROM swarm_runs ORDER BY created_at DESC LIMIT 40")) as Array<Record<string, unknown>>;
  if (!Array.isArray(rows) || !rows.length) return 0;
  const insert = db.prepare(
    `INSERT OR IGNORE INTO swarm_runs (id, objective, status, limits_json, deadline_at, created_at, updated_at, completed_at, leader_answer, error, usage_json, provider_note)
     VALUES (@id, @objective, @status, @limits_json, @deadline_at, @created_at, @updated_at, @completed_at, @leader_answer, @error, @usage_json, @provider_note)`,
  );
  let n = 0;
  for (const row of rows) {
    insert.run(row);
    n += 1;
  }
  const tasks = (await client.unsafe("SELECT * FROM swarm_tasks")) as Array<Record<string, unknown>>;
  const insertTask = db.prepare(
    `INSERT OR IGNORE INTO swarm_tasks (id, run_id, parent_id, role, objective, depends_json, urls_json, state, attempt, provider, model, result, evidence_json, error, usage_json, started_at, completed_at)
     VALUES (@id, @run_id, @parent_id, @role, @objective, @depends_json, @urls_json, @state, @attempt, @provider, @model, @result, @evidence_json, @error, @usage_json, @started_at, @completed_at)`,
  );
  if (Array.isArray(tasks)) {
    for (const task of tasks) insertTask.run(task);
  }
  return n;
}
