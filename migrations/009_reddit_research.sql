-- 009_reddit_research.sql
-- Run-history log for the Reddit market-research pipeline
-- (lib/reddit-research/*). Schema mirrors the runtime DDL in
-- lib/reddit-research/store.ts as closely as PG will allow — same
-- TEXT-vs-TIMESTAMPTZ drift as every other migration in this repo (see
-- 008_aion_continuity.sql): TIMESTAMPTZ here, TEXT at runtime. The PG
-- mirror auto-runs the runtime DDL verbatim on first write as a fallback;
-- hand-running this migration is the explicit path.

CREATE TABLE IF NOT EXISTS reddit_research_runs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK(status IN ('success','skipped','failed')),
  trigger TEXT NOT NULL CHECK(trigger IN ('scheduled','manual')),
  posts_scanned INTEGER NOT NULL DEFAULT 0,
  comments_scanned INTEGER NOT NULL DEFAULT 0,
  query TEXT,
  category TEXT,
  theme_summary TEXT,
  scheduled_post_id TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reddit_research_runs_created_at ON reddit_research_runs(created_at);
