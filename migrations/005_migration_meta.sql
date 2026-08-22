-- 005_migration_meta.sql
-- Migration bookkeeping. The runner writes (id, applied_at) here so we
-- only run each migration once.

CREATE TABLE IF NOT EXISTS _migrations (
  id TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
