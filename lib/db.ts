import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const dbPath = path.resolve(process.env.DATABASE_PATH || "./data/video-engine.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const globalForDb = globalThis as unknown as { videoEngineDb?: Database.Database };
export const db = globalForDb.videoEngineDb ?? new Database(dbPath);
if (process.env.NODE_ENV !== "production") globalForDb.videoEngineDb = db;

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS api_tokens (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  token_prefix TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TEXT,
  revoked_at TEXT
);
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
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
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
  turnaround_started_at TEXT,
  turnaround_finished_at TEXT,
  turnaround_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS avatar_views (
  avatar_id TEXT NOT NULL,
  view TEXT NOT NULL CHECK (view IN ('front','left','right','back')),
  file_path TEXT,
  status TEXT NOT NULL DEFAULT 'missing',
  generation_status TEXT NOT NULL DEFAULT 'idle',
  generation_model TEXT,
  generation_prompt TEXT,
  generation_error TEXT,
  generation_started_at TEXT,
  generation_finished_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT
);
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
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS social_content_packages (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  model TEXT NOT NULL,
  package_json TEXT NOT NULL,
  edited_json TEXT,
  edited_by TEXT,
  approved INTEGER NOT NULL DEFAULT 0,
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS social_content_revisions (
  id TEXT PRIMARY KEY,
  package_id TEXT NOT NULL,
  editor TEXT,
  before_json TEXT NOT NULL,
  after_json TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (package_id) REFERENCES social_content_packages(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS monitor_runs (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  status TEXT NOT NULL,
  model TEXT,
  input_json TEXT,
  output_json TEXT,
  error TEXT,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT
);
CREATE TABLE IF NOT EXISTS connected_accounts (
  id TEXT PRIMARY KEY,
  toolkit TEXT NOT NULL,
  connected_account_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  alias TEXT,
  raw_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_sync_at TEXT,
  UNIQUE(toolkit, user_id)
);
CREATE TABLE IF NOT EXISTS scheduled_posts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  network TEXT NOT NULL,
  scheduled_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','pending','approved','published','failed')),
  auto_post INTEGER NOT NULL DEFAULT 0,
  caption TEXT NOT NULL DEFAULT '',
  video_job_id TEXT,
  connected_account_id TEXT,
  published_at TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (video_job_id) REFERENCES video_jobs(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_scheduled_at ON scheduled_posts(scheduled_at);
`);

function ensureColumn(table: string, column: string, ddl: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}
try { ensureColumn("video_jobs", "provider", "provider TEXT NOT NULL DEFAULT 'veo'"); } catch {}

function seedDefaultAvatars() {
  const row = db.prepare("SELECT COUNT(*) as n FROM avatars").get() as { n: number };
  if (row.n > 0) return;
  try {
    const presetsPath = path.resolve(process.cwd(), "data/avatar-presets.json");
    const raw = fs.readFileSync(presetsPath, "utf8");
    const presets = JSON.parse(raw) as Array<{
      id: string;
      name: string;
      gender: string;
      archetype: string;
      wardrobeStandard: string;
      notes: string;
      referenceImage?: string | null;
    }>;
    const insert = db.prepare(
      "INSERT INTO avatars(id,name,gender,archetype,wardrobe_standard,notes,reference_image_path,status) VALUES(?,?,?,?,?,?,?,?)"
    );
    const insertView = db.prepare(
      "INSERT INTO avatar_views(avatar_id,view,file_path,status) VALUES(?,?,?,?)"
    );
    for (const p of presets) {
      insert.run(p.id, p.name, p.gender, p.archetype, p.wardrobeStandard, p.notes, p.referenceImage ?? null, p.referenceImage ? "ready" : "draft");
      for (const v of ["front", "left", "right", "back"] as const) insertView.run(p.id, v, null, "missing");
    }
  } catch {}
}
seedDefaultAvatars();

// Start the avatar generation watchdog. It scans every 60s for views
// that have been 'generating' for >2 minutes and force-fails them. This
// is the safety net for the rare case where the in-process AbortController
// / Promise.race timeout doesn't fire (Node event loop starved, process
// reaped, etc.). Idempotent — re-importing this module is safe.
import("./avatar-watchdog").then((m) => m.startWatchdogLoop()).catch(() => { /* noop */ });
