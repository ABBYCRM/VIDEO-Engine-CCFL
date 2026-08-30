// Direct test of the SQL queries from lib/composio/client.ts
// getActiveConnectedAccountId(). Avoids the @/lib/... import path issue
// (same pattern as tests/unit/aion-policy-completeness.test.ts).

import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";

// Same SQL the production code runs.
function getActiveExact(db: any, toolkit: string, userId: string): string | null {
  const row = db.prepare(
    "SELECT connected_account_id FROM connected_accounts WHERE toolkit=? AND user_id=? AND UPPER(status)='ACTIVE' LIMIT 1"
  ).get(toolkit, userId) as { connected_account_id: string } | undefined;
  return row?.connected_account_id || null;
}

function getActiveFallback(db: any, toolkit: string, preferredUserId: string): string | null {
  const row = db.prepare(
    "SELECT connected_account_id FROM connected_accounts WHERE toolkit=? AND UPPER(status)='ACTIVE' ORDER BY (user_id=?) DESC, updated_at DESC LIMIT 1"
  ).get(toolkit, preferredUserId) as { connected_account_id: string } | undefined;
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
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
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
  db.prepare("INSERT INTO connected_accounts(id, toolkit, connected_account_id, user_id, status, updated_at) VALUES(?,?,?,?,?,?)")
    .run("row1", "instagram", "ca_admin_ig", "admin", "ACTIVE", "2026-08-24");
  db.prepare("INSERT INTO connected_accounts(id, toolkit, connected_account_id, user_id, status, updated_at) VALUES(?,?,?,?,?,?)")
    .run("row2", "instagram", "ca_other_ig", "nova-luis", "ACTIVE", "2026-08-25");
  assert.equal(getActiveFallback(db, "instagram", "admin"), "ca_admin_ig", "admin row wins even if other was updated more recently");
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
