-- 003_jobs_campaigns.sql
-- Video job queue + campaigns + social content packages + monitor runs.

CREATE TABLE IF NOT EXISTS video_jobs (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  category TEXT NOT NULL,
  prompt TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'veo',
  model TEXT NOT NULL,
  aspect_ratio TEXT NOT NULL,
  resolution TEXT NOT NULL,
  provider_operation TEXT,
  status TEXT NOT NULL,
  error TEXT,
  output_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_video_jobs_status ON video_jobs(status);
CREATE INDEX IF NOT EXISTS idx_video_jobs_created ON video_jobs(created_at DESC);

CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  website TEXT,
  mission TEXT,
  tone TEXT,
  platform TEXT,
  target_audience TEXT,
  avatar_id TEXT,
  background_id TEXT,
  site_context TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_avatar ON campaigns(avatar_id);

CREATE TABLE IF NOT EXISTS social_content_packages (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  package_json TEXT NOT NULL,
  edited_json TEXT,
  edited_by TEXT,
  approved INTEGER NOT NULL DEFAULT 0,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_social_content_packages_campaign ON social_content_packages(campaign_id);

CREATE TABLE IF NOT EXISTS social_content_revisions (
  id TEXT PRIMARY KEY,
  package_id TEXT NOT NULL REFERENCES social_content_packages(id) ON DELETE CASCADE,
  editor TEXT,
  before_json TEXT NOT NULL,
  after_json TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_social_content_revisions_package ON social_content_revisions(package_id);

CREATE TABLE IF NOT EXISTS monitor_runs (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  status TEXT NOT NULL,
  model TEXT,
  input_json TEXT,
  output_json TEXT,
  error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_monitor_runs_scope ON monitor_runs(scope);
CREATE INDEX IF NOT EXISTS idx_monitor_runs_started ON monitor_runs(started_at DESC);
