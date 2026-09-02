-- 006_dev_skill_vectors.sql
-- pgvector store for Claw's dev-skills RAG (stage-1 semantic retrieval).
--
-- Runs against the DigitalOcean Managed Postgres bound as DATABASE_URL
-- (see .do/app.yaml). DO Managed Postgres supports the `vector` extension
-- (pgvector) on PG 14+. The application mirror of this DDL lives in
-- lib/claw/vector-store.ts::ensureVectorSchema so the admin index route
-- works even before migrations run; keep the two in sync.
--
-- Dimension note: vector(1024) matches nvidia/nv-embedqa-e5-v5, the
-- default embedding model in lib/nvidia/embed.ts (EMBED_DIM). If you
-- switch to a model with a different dimension you MUST change 1024 here
-- and re-index.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS dev_skill_vectors (
  id           TEXT PRIMARY KEY,
  category     TEXT NOT NULL,
  tags         TEXT[] NOT NULL DEFAULT '{}',
  summary      TEXT NOT NULL,
  body         TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  embedding    vector(1024) NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- HNSW index for fast approximate nearest-neighbour cosine search.
CREATE INDEX IF NOT EXISTS idx_dev_skill_vectors_embedding
  ON dev_skill_vectors USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_dev_skill_vectors_category
  ON dev_skill_vectors (category);
