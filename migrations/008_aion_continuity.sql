-- 008_aion_continuity.sql
-- AION continuity layer for Claw (operator directive 2026-08-30, "New era
-- marketing"). Five new tables scoped to claw_conversations(id) so deleting
-- a conversation deletes its AION records with it.
--
-- Schema is intentionally written to match the runtime DDL in
-- lib/aion/store.ts as closely as PG will allow. The repo already has a
-- TEXT-vs-TIMESTAMPTZ drift between runtime DDL and migrations/*.sql; we
-- use TIMESTAMPTZ here (the migrations convention) and let the runtime DDL
-- create TEXT columns on first import. The columns are functionally
-- equivalent for the queries this layer runs.
--
-- This migration MUST run before lib/aion/store.ts executes its db.exec().
-- The PG mirror auto-runs the runtime DDL verbatim on first write, which
-- also works as a fallback. Hand-running this migration is the explicit path.
--
-- The corrector's caveat about the fire-and-forget PG mirror still applies:
-- until lib/db-pg-mirror.ts is refactored to make PG the awaited source of
-- truth, AION writes are durable with best-effort PG replication, not
-- zero-loss.

CREATE TABLE IF NOT EXISTS claw_conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'New thread',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS claw_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL
    REFERENCES claw_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL
    CHECK (role IN ('user', 'assistant', 'tool', 'system')),
  content TEXT NOT NULL DEFAULT '',
  tool_json TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_claw_messages_conv
  ON claw_messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS aion_epistemic_records (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL
    REFERENCES claw_conversations(id) ON DELETE CASCADE,
  entity_key TEXT NOT NULL,
  category TEXT NOT NULL
    CHECK (category IN (
      'OBSERVATION',
      'INFERENCE',
      'HYPOTHESIS',
      'SPECULATION'
    )),
  content_json TEXT NOT NULL,
  confidence DOUBLE PRECISION NOT NULL
    CHECK (confidence >= 0 AND confidence <= 1),
  source TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aion_epistemic_conv
  ON aion_epistemic_records(conversation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS aion_state_entries (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL
    REFERENCES claw_conversations(id) ON DELETE CASCADE,
  entry_key TEXT NOT NULL,
  entry_value_json TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(conversation_id, entry_key)
);

CREATE TABLE IF NOT EXISTS aion_decision_contracts (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL
    REFERENCES claw_conversations(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  state TEXT NOT NULL
    CHECK (state IN ('COMMIT', 'DEFER', 'REJECT')),
  risk_level TEXT NOT NULL
    CHECK (risk_level IN ('read', 'draft', 'costly', 'external', 'destructive', 'code')),
  goal TEXT NOT NULL,
  rationale TEXT NOT NULL,
  risks_json TEXT NOT NULL,
  action_payload_json TEXT,
  confidence DOUBLE PRECISION NOT NULL
    CHECK (confidence >= 0 AND confidence <= 1),
  reversible INTEGER NOT NULL CHECK (reversible IN (0, 1)),
  confirmation_required INTEGER NOT NULL
    CHECK (confirmation_required IN (0, 1)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aion_decisions_conv
  ON aion_decision_contracts(conversation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS aion_audits (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL
    REFERENCES claw_conversations(id) ON DELETE CASCADE,
  assistant_message_id TEXT,
  passed INTEGER NOT NULL CHECK (passed IN (0, 1)),
  flags_json TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aion_audits_conv
  ON aion_audits(conversation_id, created_at DESC);
