-- 002_avatars.sql
-- Avatars + 4-view turnaround + generation audit.

CREATE TABLE IF NOT EXISTS avatars (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  gender TEXT NOT NULL,
  archetype TEXT NOT NULL,
  wardrobe_standard TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  reference_image_path TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  turnaround_status TEXT NOT NULL DEFAULT 'draft',
  turnaround_model TEXT,
  turnaround_started_at TIMESTAMPTZ,
  turnaround_finished_at TIMESTAMPTZ,
  turnaround_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS avatar_views (
  avatar_id TEXT NOT NULL REFERENCES avatars(id) ON DELETE CASCADE,
  view TEXT NOT NULL CHECK (view IN ('front','left','right','back')),
  file_path TEXT,
  status TEXT NOT NULL DEFAULT 'missing',
  generation_status TEXT NOT NULL DEFAULT 'idle',
  generation_model TEXT,
  generation_prompt TEXT,
  generation_error TEXT,
  generation_started_at TIMESTAMPTZ,
  generation_finished_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (avatar_id, view)
);

CREATE TABLE IF NOT EXISTS avatar_generations (
  id TEXT PRIMARY KEY,
  avatar_id TEXT NOT NULL,
  view TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt TEXT NOT NULL,
  reference_image_path TEXT,
  result_path TEXT,
  status TEXT NOT NULL,
  error TEXT,
  latency_ms INTEGER,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_avatar_generations_avatar ON avatar_generations(avatar_id);
