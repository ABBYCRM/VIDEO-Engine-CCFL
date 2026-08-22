-- 004_integrations.sql
-- Composio connected accounts + scheduled posts.

CREATE TABLE IF NOT EXISTS connected_accounts (
  id TEXT PRIMARY KEY,
  toolkit TEXT NOT NULL,
  connected_account_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  alias TEXT,
  raw_json TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_sync_at TIMESTAMPTZ,
  UNIQUE(toolkit, user_id)
);
CREATE INDEX IF NOT EXISTS idx_connected_accounts_toolkit ON connected_accounts(toolkit);

CREATE TABLE IF NOT EXISTS scheduled_posts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  network TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending','approved','published','failed')),
  auto_post INTEGER NOT NULL DEFAULT 0,
  caption TEXT NOT NULL DEFAULT '',
  video_job_id TEXT REFERENCES video_jobs(id) ON DELETE SET NULL,
  connected_account_id TEXT,
  published_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_scheduled_at ON scheduled_posts(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_status ON scheduled_posts(status);
