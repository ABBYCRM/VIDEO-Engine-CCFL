-- 010_site_autopilot.sql
-- Run-history for the Site/IG autopilot pipeline (lib/site-autopilot/*),
-- plus the unified background-generation ledger (lib/generation-ledger.ts)
-- that both it and the Reddit market-research pipeline share so the daily
-- generation cap bounds total spend across every autonomous pipeline, not
-- just Claw's own chat loop. Schema mirrors the runtime DDL as closely as
-- PG will allow — same TEXT-vs-TIMESTAMPTZ drift as every other migration
-- in this repo (see 008_aion_continuity.sql).

CREATE TABLE IF NOT EXISTS site_autopilot_runs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK(status IN ('success','skipped','failed')),
  trigger TEXT NOT NULL CHECK(trigger IN ('scheduled','manual')),
  category TEXT,
  scene_summary TEXT,
  scheduled_post_id TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_site_autopilot_runs_created_at ON site_autopilot_runs(created_at);

CREATE TABLE IF NOT EXISTS background_generation_commits (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_background_generation_commits_created_at ON background_generation_commits(created_at);
