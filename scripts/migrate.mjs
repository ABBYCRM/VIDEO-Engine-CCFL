#!/usr/bin/env node
// scripts/migrate.mjs
// Run all migrations/00[0-9]*.sql files in order against $DATABASE_URL.
// Idempotent — each migration is wrapped in a transaction and recorded in
// the `_migrations` table so it's only applied once.
//
// Usage:
//   DATABASE_URL=postgresql://... node scripts/migrate.mjs
//
// In dev (no DATABASE_URL), exits 0 without doing anything — the SQLite
// fallback in lib/db.ts is still the dev path.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, "..", "migrations");

const url = process.env.DATABASE_URL;
if (!url) {
  console.log("[migrate] DATABASE_URL not set — skipping (dev/SQLite mode).");
  process.exit(0);
}

let postgres;
try {
  postgres = (await import("postgres")).default;
} catch (e) {
  console.error("[migrate] ERROR: 'postgres' package is not installed. Run: npm i postgres");
  process.exit(1);
}

const sql = postgres(url, { ssl: "require", onnotice: () => {}, max: 1 });
try {
  // Ensure the bookkeeping table exists before we start.
  await sql`
    CREATE TABLE IF NOT EXISTS _migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  const files = (await fs.readdir(migrationsDir))
    .filter(f => /^[0-9]+_.*\.sql$/.test(f))
    .sort();
  if (!files.length) {
    console.log("[migrate] no migrations found in", migrationsDir);
    return;
  }

  const applied = new Set(
    (await sql`SELECT id FROM _migrations`).map(r => r.id)
  );

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`[migrate] ✓ ${file} (already applied)`);
      continue;
    }
    const body = await fs.readFile(path.join(migrationsDir, file), "utf8");
    console.log(`[migrate] → applying ${file} (${body.length} bytes)`);
    try {
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`INSERT INTO _migrations(id) VALUES(${file})`;
      });
      console.log(`[migrate] ✓ ${file}`);
    } catch (e) {
      console.error(`[migrate] ✗ ${file} failed:`, e.message);
      process.exit(2);
    }
  }
  console.log("[migrate] done.");
} finally {
  await sql.end({ timeout: 5 });
}
