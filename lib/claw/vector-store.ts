// lib/claw/vector-store.ts — pgvector-backed retrieval for the dev-skills RAG.
//
// STAGE 1: embed the query, order by cosine distance in Postgres, and take
// candidates. STAGE 2 (rerank.ts) sharpens that candidate pool.
//
// The store is optional at runtime: without a Postgres URL, or if embedding
// retrieval fails, callers fall back to keyword retrieval. The stored vectors
// are derived data and can always be rebuilt from DEV_SKILLS.

import crypto from "node:crypto";
import { DEV_SKILLS, type DevSkill } from "./dev-skills";
import { embedTexts, EMBED_DIM } from "@/lib/nvidia/embed";

type Sql = any;

const TABLE = "dev_skill_vectors";
export const VECTOR_TABLE_DIMENSION = EMBED_DIM;

export function getVectorDbUrl(): string | null {
  return process.env.VECTOR_DATABASE_URL || process.env.DATABASE_URL || null;
}

export function isVectorStoreConfigured(): boolean {
  return Boolean(getVectorDbUrl());
}

let _sql: Sql | null = null;
let _sqlUrl: string | null = null;

async function getSql(): Promise<Sql> {
  const url = getVectorDbUrl();
  if (!url) throw new Error("No VECTOR_DATABASE_URL / DATABASE_URL configured");
  if (_sql && _sqlUrl === url) return _sql;
  const postgres = (await import("postgres")).default;
  _sql = postgres(url, { ssl: "require", onnotice: () => {}, max: 3, idle_timeout: 20 });
  _sqlUrl = url;
  return _sql;
}

function toVectorLiteral(vec: number[]): string {
  if (vec.length !== EMBED_DIM) {
    throw new Error(`Embedding dimension mismatch: expected ${EMBED_DIM}, received ${vec.length}`);
  }
  if (!vec.every((value) => Number.isFinite(value))) {
    throw new Error("Embedding contains non-finite values");
  }
  return `[${vec.join(",")}]`;
}

function contentHash(s: DevSkill): string {
  return crypto.createHash("sha256").update(`${s.summary}\u0000${s.tags.join(",")}\u0000${s.body}`).digest("hex");
}

function skillDocument(s: DevSkill): string {
  return `${s.summary}\nTags: ${s.tags.join(", ")}\n${s.body}`;
}

/**
 * Ensure the pgvector table matches the active embedding dimension.
 *
 * A previous production schema used vector(1024). PostgreSQL's CREATE TABLE
 * IF NOT EXISTS cannot change an existing pgvector typmod, so merely changing
 * the DDL would leave production broken. Because this table is a derived RAG
 * index, a dimension mismatch is repaired by dropping and recreating only this
 * table. The next indexDevSkills() call repopulates it from DEV_SKILLS.
 */
export async function ensureVectorSchema(): Promise<void> {
  const sql = await getSql();
  await sql`CREATE EXTENSION IF NOT EXISTS vector`;

  const dimensionRows: Array<{ type: string }> = await sql`
    SELECT format_type(a.atttypid, a.atttypmod) AS type
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = ${TABLE}
      AND n.nspname = current_schema()
      AND a.attname = 'embedding'
      AND a.attnum > 0
      AND NOT a.attisdropped
    LIMIT 1
  `;

  const existingType = dimensionRows[0]?.type ?? null;
  const expectedType = `vector(${EMBED_DIM})`;
  if (existingType && existingType !== expectedType) {
    console.warn(`[vector-store] rebuilding ${TABLE}: ${existingType} -> ${expectedType}`);
    await sql.unsafe(`DROP TABLE IF EXISTS ${TABLE}`);
  }

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

export async function indexDevSkills(opts: { force?: boolean; signal?: AbortSignal } = {}): Promise<IndexReport> {
  const sql = await getSql();
  await ensureVectorSchema();

  const existing = new Map<string, string>();
  const rows: Array<{ id: string; content_hash: string }> = await sql`SELECT id, content_hash FROM ${sql(TABLE)}`;
  for (const r of rows) existing.set(r.id, r.content_hash);

  const corpusIds = new Set(DEV_SKILLS.map((s) => s.id));
  let deleted = 0;
  const stale = [...existing.keys()].filter((id) => !corpusIds.has(id));
  if (stale.length > 0) {
    await sql`DELETE FROM ${sql(TABLE)} WHERE id = ANY(${stale})`;
    deleted = stale.length;
  }

  const toEmbed = DEV_SKILLS.filter((s) => opts.force || existing.get(s.id) !== contentHash(s));
  const skipped = DEV_SKILLS.length - toEmbed.length;

  let embedded = 0;
  const BATCH = 32;
  for (let i = 0; i < toEmbed.length; i += BATCH) {
    const batch = toEmbed.slice(i, i + BATCH);
    const vectors = await embedTexts({
      texts: batch.map(skillDocument),
      inputType: "passage",
      signal: opts.signal
    });
    if (vectors.length !== batch.length) {
      throw new Error(`Embedding batch count mismatch: expected ${batch.length}, received ${vectors.length}`);
    }

    for (let j = 0; j < batch.length; j++) {
      const s = batch[j];
      const vec = vectors[j];
      const vectorLiteral = toVectorLiteral(vec);
      await sql`
        INSERT INTO ${sql(TABLE)} (id, category, tags, summary, body, content_hash, embedding, updated_at)
        VALUES (${s.id}, ${s.category}, ${s.tags}, ${s.summary}, ${s.body}, ${contentHash(s)}, ${vectorLiteral}::vector, NOW())
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

export async function countVectors(): Promise<number> {
  const sql = await getSql();
  const [row]: Array<{ n: string }> = await sql`SELECT COUNT(*)::text AS n FROM ${sql(TABLE)}`;
  return Number(row?.n ?? 0);
}

export type VectorHit = { id: string; distance: number };

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
  } catch (e) {
    console.warn(`[vector-store] query embedding failed, falling back to keyword: ${e instanceof Error ? e.message : String(e)}`);
    return [];
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
