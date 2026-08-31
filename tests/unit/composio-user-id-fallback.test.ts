// Direct test of the SQL queries from lib/composio/client.ts
// getActiveConnectedAccountId(). Avoids the @/lib/... import path issue
// (same pattern as tests/unit/aion-policy-completeness.test.ts) by
// extracting the literal query strings from the source file's raw text
// instead of hand-copying them — a hand-copy previously drifted out of
// sync with a real fix (the fallback query used to reference a
// non-existent `updated_at` column; production was fixed to
// `COALESCE(last_sync_at, created_at)` on 2026-08-30, but this test's
// private copy kept the stale column and a matching fake schema column,
// so it kept passing while testing SQL nothing in production still runs).

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = fs.readFileSync(path.join(__dirname, "../../lib/composio/client.ts"), "utf8");

function extractQuery(pattern: RegExp): string {
  const match = SOURCE.match(pattern);
  assert.ok(match, `expected to find a query matching ${pattern} in lib/composio/client.ts`);
  return match[1];
}

const EXACT_SQL = extractQuery(/"(SELECT connected_account_id FROM connected_accounts WHERE toolkit=\? AND user_id=\?[^"]*)"/);
const FALLBACK_SQL = extractQuery(/"(SELECT connected_account_id, user_id FROM connected_accounts WHERE toolkit=\?[^"]*)"/);

function getActiveExact(db: any, toolkit: string, userId: string): string | null {
  const row = db.prepare(EXACT_SQL).get(toolkit, userId) as { connected_account_id: string } | undefined;
  return row?.connected_account_id || null;
}

function getActiveFallback(db: any, toolkit: string, preferredUserId: string): string | null {
  const row = db.prepare(FALLBACK_SQL).get(toolkit, preferredUserId) as { connected_account_id: string } | undefined;
  return row?.connected_account_id || null;
}

function setupDb() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE connected_accounts (
      id TEXT PRIMARY KEY,
      toolkit TEXT NOT NULL,
      connected_account_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      status TEXT NOT NULL,
      alias TEXT,
      raw_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      last_sync_at TEXT,
      UNIQUE(toolkit, user_id)
    );
  `);
  return db;
}

test("exact user_id match wins when present", () => {
  const db = setupDb();
  db.prepare("INSERT INTO connected_accounts(id, toolkit, connected_account_id, user_id, status) VALUES(?,?,?,?,?)")
    .run("row1", "reddit", "ca_admin_reddit", "admin", "ACTIVE");
  assert.equal(getActiveExact(db, "reddit", "admin"), "ca_admin_reddit");
  assert.equal(getActiveFallback(db, "reddit", "admin"), "ca_admin_reddit");
});

test("falls back to a non-admin user_id when admin has no row (THE BUG)", () => {
  // This is the real-world situation: Reddit is connected under
  // user_id='pg-test-4808425e-...' but the app looks for user_id='admin'.
  // The exact-match query returns null; the fallback query finds it.
  const db = setupDb();
  db.prepare("INSERT INTO connected_accounts(id, toolkit, connected_account_id, user_id, status) VALUES(?,?,?,?,?)")
    .run("row1", "reddit", "ca_qYqbjwU_z6Sd", "pg-test-4808425e-831f-45cd-963c-40cf08e3472c", "ACTIVE");
  assert.equal(getActiveExact(db, "reddit", "admin"), null, "exact-match returns null (this is the bug)");
  assert.equal(getActiveFallback(db, "reddit", "admin"), "ca_qYqbjwU_z6Sd", "fallback returns the real connection");
});

test("prefers the requested user_id when both exist", () => {
  const db = setupDb();
  db.prepare("INSERT INTO connected_accounts(id, toolkit, connected_account_id, user_id, status, last_sync_at) VALUES(?,?,?,?,?,?)")
    .run("row1", "instagram", "ca_admin_ig", "admin", "ACTIVE", "2026-08-24");
  db.prepare("INSERT INTO connected_accounts(id, toolkit, connected_account_id, user_id, status, last_sync_at) VALUES(?,?,?,?,?,?)")
    .run("row2", "instagram", "ca_other_ig", "nova-luis", "ACTIVE", "2026-08-25");
  assert.equal(getActiveFallback(db, "instagram", "admin"), "ca_admin_ig", "admin row wins even if the other one synced more recently");
});

test("ignores EXPIRED rows", () => {
  const db = setupDb();
  db.prepare("INSERT INTO connected_accounts(id, toolkit, connected_account_id, user_id, status) VALUES(?,?,?,?,?)")
    .run("row1", "instagram", "ca_expired_ig", "admin", "EXPIRED");
  assert.equal(getActiveExact(db, "instagram", "admin"), null);
  assert.equal(getActiveFallback(db, "instagram", "admin"), null);
});

test("returns null when nothing is connected", () => {
  const db = setupDb();
  assert.equal(getActiveExact(db, "reddit", "admin"), null);
  assert.equal(getActiveFallback(db, "reddit", "admin"), null);
});
