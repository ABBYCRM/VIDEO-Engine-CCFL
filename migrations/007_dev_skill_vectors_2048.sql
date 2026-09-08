-- 007_dev_skill_vectors_2048.sql
-- Upgrade existing dev-skills vector indexes from the former 1024-dim
-- embedding schema to nvidia/nemotron-3-embed-1b's native 2048 dimensions.
--
-- dev_skill_vectors is a derived/rebuildable search index; its canonical
-- source is DEV_SKILLS. Recreating this table is therefore safer than trying
-- to cast incompatible pgvector dimensions in place. After migration,
-- POST /api/claw/skills/index with {"force":true} repopulates it.

CREATE EXTENSION IF NOT EXISTS vector;

DROP TABLE IF EXISTS dev_skill_vectors;

CREATE TABLE dev_skill_vectors (
  id           TEXT PRIMARY KEY,
  category     TEXT NOT NULL,
  tags         TEXT[] NOT NULL DEFAULT '{}',
  summary      TEXT NOT NULL,
  body         TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  embedding    vector(2048) NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dev_skill_vectors_embedding
  ON dev_skill_vectors USING hnsw (embedding vector_cosine_ops);

CREATE INDEX idx_dev_skill_vectors_category
  ON dev_skill_vectors (category);
