import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const dbPath = path.resolve(process.env.DATABASE_PATH || "./data/video-engine.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const globalForDb = globalThis as unknown as { videoEngineDb?: Database.Database };
export const db = globalForDb.videoEngineDb ?? new Database(dbPath);
if (process.env.NODE_ENV !== "production") globalForDb.videoEngineDb = db;

db.pragma("journal_mode = WAL");
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
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS avatar_views (
  avatar_id TEXT NOT NULL,
  view TEXT NOT NULL CHECK (view IN ('front','left','right','back')),
  file_path TEXT,
  status TEXT NOT NULL DEFAULT 'missing',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (avatar_id, view)
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
  package_json TEXT NOT NULL,   -- serialized SocialContentPackage (AI copy)
  edited_json TEXT,             -- human-edited copy
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
  scope TEXT NOT NULL,           -- "global" | "campaign:<id>" | "provider:<id>"
  status TEXT NOT NULL,          -- "dormant" | "ok" | "error"
  model TEXT,
  input_json TEXT,
  output_json TEXT,
  error TEXT,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT
);
`);

// Migrations: tolerate older deployments that don't have the provider column.
function ensureColumn(table: string, column: string, ddl: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}
try { ensureColumn("video_jobs", "provider", "provider TEXT NOT NULL DEFAULT 'veo'"); } catch {}

// One-time seed: copy the 2 default avatar presets from JSON into the DB so the
// page can read from a single source of truth. Existing rows are left alone.
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
      insert.run(
        p.id,
        p.name,
        p.gender,
        p.archetype,
        p.wardrobeStandard,
        p.notes,
        p.referenceImage ?? null,
        p.referenceImage ? "ready" : "draft"
      );
      for (const v of ["front", "left", "right", "back"] as const) {
        insertView.run(p.id, v, null, "missing");
      }
    }
  } catch {
    // First run on a fresh repo: data/avatar-presets.json may not exist yet.
    // That's fine — the page will still render via the JSON catalog.
  }
}
seedDefaultAvatars();
