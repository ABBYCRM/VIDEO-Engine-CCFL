-- 006_dev_skill_vectors.sql
-- pgvector store for Claw's dev-skills RAG (stage-1 semantic retrieval).
--
-- Runs against the DigitalOcean Managed Postgres bound as DATABASE_URL.
-- The application mirror of this DDL lives in
-- lib/claw/vector-store.ts::ensureVectorSchema; keep the two in sync.
--
-- Dimension note: vector(2048) matches nvidia/nemotron-3-embed-1b, the
-- active default embedding model in lib/nvidia/embed.ts (EMBED_DIM).
-- Existing deployments created with vector(1024) are upgraded by migration
-- 007 because pgvector dimensions are part of the column type.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS dev_skill_vectors (
  id           TEXT PRIMARY KEY,
  category     TEXT NOT NULL,
  tags         TEXT[] NOT NULL DEFAULT '{}',
  summary      TEXT NOT NULL,
  body         TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  embedding    vector(2048) NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dev_skill_vectors_embedding
  ON dev_skill_vectors USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_dev_skill_vectors_category
  ON dev_skill_vectors (category);
