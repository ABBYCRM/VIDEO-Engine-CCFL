// lib/db.ts — Claw-only.
//
// 2026-08-30 "Claw only" repo strip. The previous version of this file
// managed a much larger schema (campaigns, video_jobs, scheduled_posts,
// connected_accounts, aion_decision_contracts, aion_epistemic_records,
// aion_audit_runs, …) plus dynamic imports for six background loops.
// Every one of those is gone now; this module owns exactly the tables
// the Claw chat console needs (claw_conversations, claw_messages,
// claw_files, settings, api_tokens) and exposes a single `db` handle
// for the rest of the app to share.
//
// The Postgres mirror (lib/db-pg-mirror.ts) and the hydration shim
// (lib/db-hydrate.ts) were stripped with the rest of the old build.
// The CLAW_DATABASE_URL env var is no longer read; SQLite is the only
// store.

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.resolve(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, "claw.db");

const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
sqlite.pragma("synchronous = NORMAL");

// Settings + auth + sessions — minimum surface for a single-user console.
sqlite.exec(`
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

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_label TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);
`);

// Claw chat tables. The Claw console owns these end-to-end; no other
// subsystem reads or writes them.
sqlite.exec(`
CREATE TABLE IF NOT EXISTS claw_conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'New thread',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS claw_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  tool_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES claw_conversations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS claw_files (
  id TEXT PRIMARY KEY,
  conversation_id TEXT,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  path TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_claw_messages_conv_created
  ON claw_messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_claw_files_conv
  ON claw_files (conversation_id, created_at);
`);

export const db = sqlite;
export { sqlite };
