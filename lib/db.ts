import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { PgMirror } from "@/lib/db-pg-mirror";

const dbPath = path.resolve(process.env.DATABASE_PATH || "./data/video-engine.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const globalForDb = globalThis as unknown as { videoEngineDb?: Database.Database };
const sqlite = globalForDb.videoEngineDb ?? new Database(dbPath);
if (process.env.NODE_ENV !== "production") globalForDb.videoEngineDb = sqlite;

// Wrap the SQLite `db` so every write is mirrored to PG in the background
// (fire-and-forget). Reads stay sync against SQLite. The PG mirror hydrates
// the local SQLite on a fresh deploy via lib/db-hydrate.ts.
type RunResult = { changes: number; lastInsertRowid?: number | bigint };

// Kick off hydration from PG on first import (only does anything if PG
// has rows and SQLite is empty). Safe to await later via hydrateFromPg.
import("@/lib/db-hydrate").then((m) => m.hydrateFromPgIfEmpty()).catch(() => {});

class Stmt {
  constructor(private inner: Database.Statement, private sql: string) {}
  get(...args: any[]) { return this.inner.get(...args); }
  all(...args: any[]) { return this.inner.all(...args); }
  run(...args: any[]): RunResult {
    const r = this.inner.run(...args) as RunResult;
    if (process.env.DATABASE_URL) {
      // Fire-and-forget PG mirror.
      void PgMirror.enqueueWrite(this.sql, args);
    }
    return r;
  }
  values<T = unknown>(...args: any[]): T[] { return (this.inner as any).values(...args) as T[]; }
}
class Db {
  private inner: Database.Database;
  constructor(s: Database.Database) { this.inner = s; }
  prepare(sql: string): Stmt { return new Stmt(this.inner.prepare(sql), sql); }
  // Rows pulled FROM the PG mirror to repopulate local SQLite after a
  // fresh deploy must never be mirrored straight back to PG — that's a
  // wasteful, always-failing round trip (SQLite's `INSERT OR IGNORE`
  // isn't valid Postgres syntax) that floods the logs on every boot.
  // Used only by lib/db-hydrate.ts.
  prepareLocalOnly(sql: string): Database.Statement { return this.inner.prepare(sql); }
  exec(sql: string) {
    this.inner.exec(sql);
    if (process.env.DATABASE_URL) {
      // Mirror raw exec blocks (used for CREATE TABLE / multi-statement
      // DDL). Best-effort.
      void PgMirror.enqueueWrite(sql, []);
    }
  }
  pragma(name: string) { return this.inner.pragma(name); }
  transaction<P extends any[], R>(fn: (...args: P) => R): (...args: P) => R { return this.inner.transaction(fn); }
}
export const db = new Db(sqlite);

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
  a2e_twin_id TEXT,
  a2e_twin_anchor_id TEXT,
  a2e_twin_status TEXT NOT NULL DEFAULT 'idle',
  a2e_twin_error TEXT,
  a2e_twin_started_at TEXT,
  a2e_twin_finished_at TEXT,
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
  latency_ms INTEGER,
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
for (const [column, ddl] of [
  ["planning_horizon_days", "planning_horizon_days INTEGER NOT NULL DEFAULT 7"],
  ["content_type", "content_type TEXT NOT NULL DEFAULT 'cinematic'"],
  ["output_mode", "output_mode TEXT NOT NULL DEFAULT 'video'"],
  ["video_provider", "video_provider TEXT NOT NULL DEFAULT 'veo'"],
  ["video_model", "video_model TEXT"],
  ["upper_provider", "upper_provider TEXT"],
  ["upper_model", "upper_model TEXT"],
  ["split_percent", "split_percent INTEGER NOT NULL DEFAULT 35"],
  ["split_relationship", "split_relationship TEXT NOT NULL DEFAULT 'anchor_field'"]
] as const) {
  try { ensureColumn("campaigns", column, ddl); } catch {}
}
for (const [column, ddl] of [
  ["upper_job_id", "upper_job_id TEXT"],
  ["lower_job_id", "lower_job_id TEXT"]
] as const) {
  try { ensureColumn("scheduled_posts", column, ddl); } catch {}
}
for (const [column, ddl] of [
  ["youtube_video_id", "youtube_video_id TEXT"],
  ["youtube_error", "youtube_error TEXT"]
] as const) {
  try { ensureColumn("scheduled_posts", column, ddl); } catch {}
}
for (const [column, ddl] of [
  ["a2e_twin_id", "a2e_twin_id TEXT"],
  ["a2e_twin_anchor_id", "a2e_twin_anchor_id TEXT"],
  ["a2e_twin_status", "a2e_twin_status TEXT NOT NULL DEFAULT 'idle'"],
  ["a2e_twin_error", "a2e_twin_error TEXT"],
  ["a2e_twin_started_at", "a2e_twin_started_at TEXT"],
  ["a2e_twin_finished_at", "a2e_twin_finished_at TEXT"]
] as const) {
  try { ensureColumn("avatars", column, ddl); } catch {}
}
try { ensureColumn("avatar_generations", "latency_ms", "latency_ms INTEGER"); } catch {}

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

// Long-running internal workers. Each start function is idempotent and disabled in tests.
// Dynamic imports avoid circular initialization while still starting workers as soon as
// the server's shared persistence layer is initialized.
import("./avatar-watchdog").then((m) => m.startWatchdogLoop()).catch(() => { /* noop */ });
import("./calendar-publisher").then((m) => m.startCalendarPublisherLoop()).catch(() => { /* noop */ });
import("./blog-autopilot").then((m) => m.startBlogAutopilotLoop()).catch(() => { /* noop */ });
import("./reddit-research/scheduler").then((m) => m.startRedditResearchAutopilotLoop()).catch(() => { /* noop */ });
import("./site-autopilot/scheduler").then((m) => m.startSiteAutopilotLoop()).catch(() => { /* noop */ });
