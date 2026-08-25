// lib/db-hydrate.ts
// On a fresh deploy (SQLite data dir wiped), pull all rows from PG into
// SQLite. Runs once per process. Best-effort; if PG is empty/unreachable,
// the app just starts fresh in SQLite.
import { db } from "@/lib/db";
import { PgMirror } from "@/lib/db-pg-mirror";

const TABLES = [
  "settings",
  "api_tokens",
  "video_jobs",
  "avatars",
  "avatar_views",
  "avatar_generations",
  "campaigns",
  "scheduled_posts",
  "campaign_assets",
  "connected_accounts",
  "media_assets",
  "audit_log"
];

let hydrated = false;
let hydrating: Promise<void> | null = null;

export async function hydrateFromPgIfEmpty(): Promise<void> {
  if (hydrated) return;
  if (hydrating) return hydrating;
  hydrating = (async () => {
    if (!process.env.DATABASE_URL) { hydrated = true; return; }
    await PgMirror.init();
    // Pick a stable probe table; if it has any rows in SQLite, we assume
    // the data dir was preserved and skip hydration.
    const probe = db.prepare("SELECT COUNT(*) as n FROM settings").get() as { n: number };
    if (probe.n > 0) { hydrated = true; return; }
    for (const table of TABLES) {
      try {
        const exists = db.prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
        ).get(table) as { name: string } | undefined;
        if (!exists) continue;
        const rows = await PgMirror.getAll(`SELECT * FROM ${table}`, []);
        if (!rows || !rows.length) continue;
        // Get column names from first row
        const cols = Object.keys(rows[0]);
        const placeholders = cols.map(() => "?").join(",");
        const insert = db.prepareLocalOnly(
          `INSERT OR IGNORE INTO ${table} (${cols.join(",")}) VALUES (${placeholders})`
        );
        const tx = db.transaction(() => {
          for (const r of rows) insert.run(...cols.map((c) => (r as any)[c]));
        });
        tx();
        console.log(`[hydrate] ${table}: pulled ${rows.length} rows from PG`);
      } catch (e) {
        console.warn(`[hydrate] ${table} failed:`, (e as Error).message);
      }
    }
    hydrated = true;
  })();
  return hydrating;
}
