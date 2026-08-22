// lib/db-pg-bootstrap.ts
// Run-once bootstrap that ensures the PG schema is present when
// DATABASE_URL is set. Does NOT replace lib/db.ts (the SQLite-backed
// runtime that every existing call site uses) — the operator can
// flip the runtime from SQLite to PG by changing the import in a
// follow-up commit once the call sites are converted to async.
//
// Used by:
//   - /api/health (reports whether PG is reachable)
//   - scripts/migrate.mjs (full migration runner with the postgres
//     npm package directly)
//
// For now, this file is the "warm up PG + apply migrations" hook so
// /api/health can report {database: "ok"} when DATABASE_URL is set.

import fs from "node:fs/promises";
import path from "node:path";

let lastCheck: { ok: boolean; error?: string; ts: number } | null = null;
const CHECK_TTL_MS = 30_000;

export async function pingPg(): Promise<{ ok: boolean; error?: string; dbName?: string }> {
  if (lastCheck && Date.now() - lastCheck.ts < CHECK_TTL_MS) {
    return { ok: lastCheck.ok, error: lastCheck.error };
  }
  if (!process.env.DATABASE_URL) {
    return { ok: false, error: "DATABASE_URL not set" };
  }
  try {
    const postgres = (await import("postgres")).default;
    const sql = postgres(process.env.DATABASE_URL, { ssl: "require", onnotice: () => {}, max: 1, idle_timeout: 2 });
    try {
      const r = await sql`SELECT current_database() as db, version() as v`;
      const result = { ok: true, dbName: r[0]?.db };
      lastCheck = { ok: true, ts: Date.now() };
      return result;
    } finally {
      await sql.end({ timeout: 3 });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    lastCheck = { ok: false, error: msg, ts: Date.now() };
    return { ok: false, error: msg };
  }
}

export async function applyMigrationsIfNeeded(): Promise<{ ran: string[]; alreadyApplied: string[]; error?: string }> {
  if (!process.env.DATABASE_URL) return { ran: [], alreadyApplied: [] };
  try {
    const postgres = (await import("postgres")).default;
    const sql = postgres(process.env.DATABASE_URL, { ssl: "require", onnotice: () => {}, max: 1, idle_timeout: 5 });
    try {
      await sql`
        CREATE TABLE IF NOT EXISTS _migrations (
          id TEXT PRIMARY KEY,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      const applied = new Set((await sql`SELECT id FROM _migrations`).map((r: any) => r.id));
      const migrationsDir = path.resolve(process.cwd(), "migrations");
      const files = (await fs.readdir(migrationsDir))
        .filter(f => /^[0-9]+_.*\.sql$/.test(f))
        .sort();
      const ran: string[] = [];
      const already: string[] = [];
      for (const file of files) {
        if (applied.has(file)) { already.push(file); continue; }
        const body = await fs.readFile(path.join(migrationsDir, file), "utf8");
        try {
          await sql.begin(async (tx) => {
            await tx.unsafe(body);
            await tx`INSERT INTO _migrations(id) VALUES(${file})`;
          });
          ran.push(file);
        } catch (e) {
          await sql.end({ timeout: 3 });
          return { ran, alreadyApplied: already, error: `${file}: ${e instanceof Error ? e.message : String(e)}` };
        }
      }
      return { ran, alreadyApplied: already };
    } finally {
      await sql.end({ timeout: 3 });
    }
  } catch (e) {
    return { ran: [], alreadyApplied: [], error: e instanceof Error ? e.message : String(e) };
  }
}
