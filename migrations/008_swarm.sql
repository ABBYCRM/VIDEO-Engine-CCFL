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
