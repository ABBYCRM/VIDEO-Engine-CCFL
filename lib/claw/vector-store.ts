// lib/claw/vector-store.ts — pgvector-backed retrieval for the dev-skills RAG.
//
// The operator runs this app on DigitalOcean App Platform with a DO
// Managed Postgres database that has the `vector` extension (pgvector)
// enabled. This module is the vector half of the two-stage RAG:
//
//   STAGE 1 (this file):  embed the query, ORDER BY embedding <=> query
//                         in Postgres, take the top ~24 candidates.
//   STAGE 2 (rerank.ts):  NVIDIA reranker sharpens the top of that pool.
//
// It is deliberately optional and self-healing:
//   - No VECTOR_DATABASE_URL / DATABASE_URL (e.g. local v0 preview, or
//     any dev box) → isVectorStoreConfigured() is false and every caller
//     falls back to the keyword prefilter. Nothing throws.
//   - DB reachable but never indexed → search returns [] and the caller
//     falls back to keyword. Call indexDevSkills() (POST the admin route
//     /api/claw/skills/index) once after deploy to populate it.
//
// Connection: postgres.js (already a dependency), ssl:"require" because
// DO Managed Postgres always requires TLS — same as scripts/migrate.mjs.
// We prefer a dedicated VECTOR_DATABASE_URL if set so the vector store
// can point at a different DB/pool than app migrations, but fall back to
// the shared DATABASE_URL.

import crypto from "node:crypto";
import { DEV_SKILLS, type DevSkill } from "./dev-skills";
import { embedTexts, EMBED_DIM } from "@/lib/nvidia/embed";

// postgres.js Sql type — imported lazily, so we keep it loose here.
type Sql = any;

const TABLE = "dev_skill_vectors";

export function getVectorDbUrl(): string | null {
  return process.env.VECTOR_DATABASE_URL || process.env.DATABASE_URL || null;
}

/** True when a Postgres URL is configured. Does NOT verify reachability
 *  or that the corpus has been indexed — callers still fall back to
 *  keyword on an empty result or an error. */
export function isVectorStoreConfigured(): boolean {
  return Boolean(getVectorDbUrl());
}

let _sql: Sql | null = null;
let _sqlUrl: string | null = null;

async function getSql(): Promise<Sql> {
  const url = getVectorDbUrl();
  if (!url) throw new Error("No VECTOR_DATABASE_URL / DATABASE_URL configured");
  if (_sql && _sqlUrl === url) return _sql;
  // Lazy import keeps postgres.js out of the module graph in SQLite-only
  // dev where this file is never exercised.
  const postgres = (await import("postgres")).default;
  _sql = postgres(url, { ssl: "require", onnotice: () => {}, max: 3, idle_timeout: 20 });
  _sqlUrl = url;
  return _sql;
}

/** Serialize a JS number[] into the pgvector text input form '[a,b,c]'.
 *  pgvector accepts this cast as ::vector. */
function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

function contentHash(s: DevSkill): string {
  return crypto.createHash("sha256").update(`${s.summary}\u0000${s.tags.join(",")}\u0000${s.body}`).digest("hex");
}

/** The text we embed for a skill — summary + tags + body, same shape
 *  the reranker scores, so both stages see the same document. */
function skillDocument(s: DevSkill): string {
  return `${s.summary}\nTags: ${s.tags.join(", ")}\n${s.body}`;
}

/**
 * Create the pgvector extension, table, and ANN index if missing.
 * Idempotent — safe to call on every index run. migrations/006 does the
 * same DDL for the migrate.mjs path; this mirrors it so the admin index
 * route works even before migrations run.
 */
export async function ensureVectorSchema(): Promise<void> {
  const sql = await getSql();
  await sql`CREATE EXTENSION IF NOT EXISTS vector`;
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      id           TEXT PRIMARY KEY,
      category     TEXT NOT NULL,
      tags         TEXT[] NOT NULL DEFAULT '{}',
      summary      TEXT NOT NULL,
      body         TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      embedding    vector(${EMBED_DIM}) NOT NULL,
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // HNSW cosine index for fast approximate nearest-neighbour search.
  await sql.unsafe(`
    CREATE INDEX IF NOT EXISTS idx_${TABLE}_embedding
      ON ${TABLE} USING hnsw (embedding vector_cosine_ops)
  `);
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_${TABLE}_category ON ${TABLE} (category)`);
}

export type IndexReport = {
  ok: boolean;
  total: number;
  embedded: number;
  skipped: number;
  deleted: number;
  note?: string;
};

/**
 * (Re)embed the dev-skills corpus into pgvector. Only skills whose
 * content hash changed (or are new) are re-embedded — a redeploy with an
 * unchanged corpus costs zero embedding calls. Skills removed from the
 * corpus are pruned. Embeds as "passage" (asymmetric model; queries use
 * "query"). Batches embedding calls to keep requests small.
 */
export async function indexDevSkills(opts: { force?: boolean; signal?: AbortSignal } = {}): Promise<IndexReport> {
  const sql = await getSql();
  await ensureVectorSchema();

  const existing = new Map<string, string>();
  const rows: Array<{ id: string; content_hash: string }> = await sql`SELECT id, content_hash FROM ${sql(TABLE)}`;
  for (const r of rows) existing.set(r.id, r.content_hash);

  const corpusIds = new Set(DEV_SKILLS.map((s) => s.id));

  // Prune rows whose skill no longer exists in the corpus.
  let deleted = 0;
  const stale = [...existing.keys()].filter((id) => !corpusIds.has(id));
  if (stale.length > 0) {
    await sql`DELETE FROM ${sql(TABLE)} WHERE id = ANY(${stale})`;
    deleted = stale.length;
  }

  // Decide which skills need embedding.
  const toEmbed = DEV_SKILLS.filter((s) => opts.force || existing.get(s.id) !== contentHash(s));
  let skipped = DEV_SKILLS.length - toEmbed.length;

  let embedded = 0;
  const BATCH = 32;
  for (let i = 0; i < toEmbed.length; i += BATCH) {
    const batch = toEmbed.slice(i, i + BATCH);
    const vectors = await embedTexts({
      texts: batch.map(skillDocument),
      inputType: "passage",
      signal: opts.signal
    });
    for (let j = 0; j < batch.length; j++) {
      const s = batch[j];
      const vec = vectors[j];
      if (!vec || vec.length === 0) continue;
      await sql`
        INSERT INTO ${sql(TABLE)} (id, category, tags, summary, body, content_hash, embedding, updated_at)
        VALUES (${s.id}, ${s.category}, ${s.tags}, ${s.summary}, ${s.body}, ${contentHash(s)}, ${toVectorLiteral(vec)}::vector, NOW())
        ON CONFLICT (id) DO UPDATE SET
          category = EXCLUDED.category,
          tags = EXCLUDED.tags,
          summary = EXCLUDED.summary,
          body = EXCLUDED.body,
          content_hash = EXCLUDED.content_hash,
          embedding = EXCLUDED.embedding,
          updated_at = NOW()
      `;
      embedded++;
    }
  }

  return { ok: true, total: DEV_SKILLS.length, embedded, skipped, deleted };
}

/** How many skill vectors are currently stored (for the index status route). */
export async function countVectors(): Promise<number> {
  const sql = await getSql();
  const [row]: Array<{ n: string }> = await sql`SELECT COUNT(*)::text AS n FROM ${sql(TABLE)}`;
  return Number(row?.n ?? 0);
}

export type VectorHit = { id: string; distance: number };

/**
 * Embed `query` and return the nearest skill ids by cosine distance
 * (smaller = closer). Returns [] when the store isn't configured, the
 * query can't be embedded, the table is empty, or anything errors — the
 * caller then falls back to keyword retrieval.
 */
export async function vectorSearch(
  query: string,
  opts: { category?: DevSkill["category"]; limit?: number; signal?: AbortSignal } = {}
): Promise<VectorHit[]> {
  const q = query.trim();
  if (!q || !isVectorStoreConfigured()) return [];
  const limit = Math.max(1, Math.min(50, opts.limit ?? 24));

  let queryVec: number[];
  try {
    [queryVec] = await embedTexts({ texts: [q], inputType: "query", signal: opts.signal });
  } catch {
    return []; // NVIDIA unconfigured or embed failed → keyword fallback
  }
  if (!queryVec || queryVec.length === 0) return [];

  try {
    const sql = await getSql();
    const lit = toVectorLiteral(queryVec);
    const rows: Array<{ id: string; distance: number }> = opts.category
      ? await sql`
          SELECT id, (embedding <=> ${lit}::vector) AS distance
          FROM ${sql(TABLE)}
          WHERE category = ${opts.category}
          ORDER BY embedding <=> ${lit}::vector
          LIMIT ${limit}
        `
      : await sql`
          SELECT id, (embedding <=> ${lit}::vector) AS distance
          FROM ${sql(TABLE)}
          ORDER BY embedding <=> ${lit}::vector
          LIMIT ${limit}
        `;
    return rows.map((r) => ({ id: r.id, distance: Number(r.distance) }));
  } catch (e) {
    console.warn(`[vector-store] search failed, falling back to keyword: ${e instanceof Error ? e.message : String(e)}`);
    return [];
  }
}
