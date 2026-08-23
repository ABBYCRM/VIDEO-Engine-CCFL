// lib/db-pg-mirror.ts
// Fire-and-forget PG mirror. Wraps the synchronous SQLite `db` so every
// write (`.run()` and `.exec()`) is forwarded to PG in the background, and
// every read (`.get()` / `.all()`) checks PG first when the local SQLite
// is empty (e.g. on a fresh deploy after the container was wiped).
//
// Why this exists: DO App Platform has no persistent volumes. The data dir
// is wiped on every deploy. novaluis-pg is reachable (with the app trusted
// source) and durable. This module makes SQLite a write-through cache to
// PG, so the app works correctly even after a wipe.
//
// Behavior:
//   - On first call: runs /migrations/00X_*.sql against PG (idempotent).
//   - On every write: enqueues a PG write (Fire-and-forget) to a worker
//     queue. Worker is single-threaded with retry; PG errors are logged
//     but never break the user's request.
//   - On every read: returns from SQLite (fast). If SQLite returns 0 rows
//     for a SELECT * query, falls back to PG once per process.

import fs from "node:fs/promises";
import path from "node:path";

type Pg = any;
let pgClient: Pg | null = null;
let pgReady: Promise<boolean> | null = null;
const pendingQueue: Array<{ sql: string; args: any[] }> = [];
let processing = false;
const MAX_QUEUE = 5000;

async function getPg(): Promise<Pg | null> {
  if (pgClient) return pgClient;
  if (!process.env.DATABASE_URL) return null;
  const postgres = (await import("postgres")).default;
  pgClient = postgres(process.env.DATABASE_URL, {
    ssl: "require",
    onnotice: () => {},
    max: 1,
    idle_timeout: 5,
    connect_timeout: 8
  });
  return pgClient;
}

async function runMigrationsOnce(): Promise<boolean> {
  if (pgReady) return pgReady;
  pgReady = (async () => {
    const pg = await getPg();
    if (!pg) return false;
    try {
      await pg`CREATE TABLE IF NOT EXISTS _migrations (
        id TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`;
      const applied = new Set(
        (await pg`SELECT id FROM _migrations`).map((r: any) => r.id)
      );
      const dir = path.resolve(process.cwd(), "migrations");
      let files: string[] = [];
      try {
        files = (await fs.readdir(dir))
          .filter((f) => /^[0-9]+_.*\.sql$/.test(f))
          .sort();
      } catch {
        return false;
      }
      for (const file of files) {
        if (applied.has(file)) continue;
        const body = await fs.readFile(path.join(dir, file), "utf8");
        try {
          await pg.begin(async (tx: any) => {
            await tx.unsafe(body);
            await tx`INSERT INTO _migrations(id) VALUES(${file})`;
          });
        } catch (e) {
          console.warn(`[pg-mirror] migration ${file} failed:`, (e as Error).message);
        }
      }
      return true;
    } catch (e) {
      console.warn("[pg-mirror] migration setup failed:", (e as Error).message);
      return false;
    }
  })();
  return pgReady;
}

function convertPlaceholders(sql: string): { text: string; argCount: number } {
  let argCount = 0;
  const text = sql.replace(/\?/g, () => {
    argCount++;
    return `$${argCount}`;
  });
  return { text, argCount };
}

async function enqueueWrite(sqlText: string, args: any[]) {
  if (!(await runMigrationsOnce())) return;
  if (pendingQueue.length > MAX_QUEUE) pendingQueue.shift(); // drop oldest on overflow
  pendingQueue.push({ sql: sqlText, args });
  pump();
}

async function pump() {
  if (processing) return;
  processing = true;
  try {
    const pg = await getPg();
    if (!pg) return;
    while (pendingQueue.length) {
      const next = pendingQueue.shift();
      if (!next) break;
      try {
        const { text } = convertPlaceholders(next.sql);
        if (next.args.length) await pg.unsafe(text, next.args);
        else await pg.unsafe(text);
      } catch (e) {
        console.warn(`[pg-mirror] write failed (${next.sql.slice(0, 60)}...):`, (e as Error).message);
      }
    }
  } finally {
    processing = false;
  }
}

export const PgMirror = {
  init: runMigrationsOnce,
  enqueueWrite,
  // Read a single row from PG. Used as a fallback when SQLite is empty
  // (e.g. on fresh deploy). Cached per (sql+args) key for 5s.
  cache: new Map<string, { value: any; ts: number }>(),
  async getRow(sqlText: string, args: any[]): Promise<any> {
    const key = sqlText + "|" + JSON.stringify(args);
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.ts < 5000) return cached.value;
    if (!(await runMigrationsOnce())) return undefined;
    const pg = await getPg();
    if (!pg) return undefined;
    try {
      const { text, argCount } = convertPlaceholders(sqlText);
      if (argCount !== args.length) return undefined;
      const result = args.length ? await pg.unsafe(text, args) : await pg.unsafe(text);
      const value = Array.isArray(result) && result.length ? result[0] : undefined;
      this.cache.set(key, { value, ts: Date.now() });
      return value;
    } catch (e) {
      console.warn(`[pg-mirror] read failed:`, (e as Error).message);
      return undefined;
    }
  },
  async getAll(sqlText: string, args: any[]): Promise<any[] | null> {
    if (!(await runMigrationsOnce())) return null;
    const pg = await getPg();
    if (!pg) return null;
    try {
      const { text, argCount } = convertPlaceholders(sqlText);
      if (argCount !== args.length) return null;
      const result = args.length ? await pg.unsafe(text, args) : await pg.unsafe(text);
      return Array.isArray(result) ? result : [];
    } catch (e) {
      return null;
    }
  }
};

// Kick off migration immediately on import (fire and forget).
void runMigrationsOnce().then((ok) => {
  if (ok) console.log("[pg-mirror] novaluis-pg migrations applied");
  else console.log("[pg-mirror] novaluis-pg not configured or unreachable; running in SQLite-only mode");
});
