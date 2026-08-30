// lib/aion/store.ts
//
// Runtime side of the AION continuity layer. Creates the four AION tables
// in SQLite on first import (idempotent). The PG mirror at lib/db-pg-mirror.ts
// auto-forwards the DDL verbatim to novaluis-pg; the migration file at
// migrations/008_aion_continuity.sql is the explicit hand-written equivalent
// for environments where the runtime DDL is undesirable.
//
// Schema choice rationale (locked 2026-08-30):
//   - TEXT for timestamps to match the existing claw_conversations/claw_messages
//     precedent in lib/claw/store.ts. The repo already has a TEXT-vs-TIMESTAMPTZ
//     drift between runtime DDL and migrations/*.sql; we copy the runtime side
//     for consistency with neighbouring tables and document the drift in the
//     PR description.
//   - TEXT PKs (application-generated crypto.randomUUID()) to match the
//     existing convention; avoids requiring gen_random_uuid() in PG.
//   - FK to claw_conversations(id) ON DELETE CASCADE so deleting a conversation
//     deletes its AION records with it. (The two Claw tables must already
//     exist — they do, see lib/claw/store.ts; the migration ensures they do
//     in fresh-deploy PG too.)
//
// Concurrency safety: writeState uses single-statement compare-and-swap on the
// `version` column. Two concurrent writes cannot both succeed; the loser
// throws AionStateConflict.

import crypto from "node:crypto";
import { db } from "@/lib/db";
import {
  encodeJson,
  requireConfidence,
  requireScopeId,
  requireText,
  type DecisionState,
  type EpistemicCategory,
  type JsonValue
} from "@/lib/aion/validation";

db.exec(`
CREATE TABLE IF NOT EXISTS aion_epistemic_records (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  entity_key TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN (
    'OBSERVATION','INFERENCE','HYPOTHESIS','SPECULATION'
  )),
  content_json TEXT NOT NULL,
  confidence REAL NOT NULL CHECK(confidence >= 0 AND confidence <= 1),
  source TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(conversation_id)
    REFERENCES claw_conversations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS aion_state_entries (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  entry_key TEXT NOT NULL,
  entry_value_json TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(conversation_id, entry_key),
  FOREIGN KEY(conversation_id)
    REFERENCES claw_conversations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS aion_decision_contracts (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('COMMIT','DEFER','REJECT')),
  risk_level TEXT NOT NULL,
  goal TEXT NOT NULL,
  rationale TEXT NOT NULL,
  risks_json TEXT NOT NULL,
  action_payload_json TEXT,
  confidence REAL NOT NULL,
  reversible INTEGER NOT NULL,
  confirmation_required INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(conversation_id)
    REFERENCES claw_conversations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS aion_audits (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  assistant_message_id TEXT,
  passed INTEGER NOT NULL,
  flags_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(conversation_id)
    REFERENCES claw_conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_aion_epistemic_conv
  ON aion_epistemic_records(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_aion_decisions_conv
  ON aion_decision_contracts(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_aion_audits_conv
  ON aion_audits(conversation_id, created_at DESC);
`);

export type MemoryRecord = {
  id: string;
  conversationId: string;
  entityKey: string;
  category: EpistemicCategory;
  content: JsonValue;
  confidence: number;
  source: string;
  createdAt: string;
};

export type DecisionRecord = {
  id: string;
  conversationId: string;
  toolName: string;
  state: DecisionState;
  riskLevel: string;
  goal: string;
  rationale: string;
  risks: string[];
  actionPayload: JsonValue | null;
  confidence: number;
  reversible: boolean;
  confirmationRequired: boolean;
  createdAt: string;
};

export type AuditRecord = {
  id: string;
  conversationId: string;
  assistantMessageId: string | null;
  passed: boolean;
  flags: JsonValue;
  createdAt: string;
};

export class AionStateConflict extends Error {
  constructor() {
    super("AION_STATE_CONFLICT");
  }
}

export function saveEpistemicRecord(input: {
  conversationId: string;
  entityKey: string;
  category: EpistemicCategory;
  content: JsonValue;
  confidence: number;
  source: string;
}): MemoryRecord {
  const id = crypto.randomUUID();
  const conversationId = requireScopeId(input.conversationId, "conversationId");
  const entityKey = requireText(input.entityKey, "entityKey", 255);
  const source = requireText(input.source, "source", 128);
  const confidence = requireConfidence(input.confidence);
  const contentJson = encodeJson(input.content);

  db.prepare(`
    INSERT INTO aion_epistemic_records(
      id, conversation_id, entity_key, category,
      content_json, confidence, source
    ) VALUES(?,?,?,?,?,?,?)
  `).run(
    id,
    conversationId,
    entityKey,
    input.category,
    contentJson,
    confidence,
    source
  );

  const row = db
    .prepare(
      "SELECT * FROM aion_epistemic_records WHERE id=? ORDER BY rowid DESC LIMIT 1"
    )
    .get(id) as any;
  return rowToRecord(row);
}

export function listEpistemicRecords(
  conversationId: string,
  limit = 20
): MemoryRecord[] {
  const scope = requireScopeId(conversationId, "conversationId");
  const bounded = Math.max(1, Math.min(50, Math.trunc(limit)));
  const rows = db
    .prepare(
      "SELECT * FROM aion_epistemic_records WHERE conversation_id=? ORDER BY created_at DESC, rowid DESC LIMIT ?"
    )
    .all(scope, bounded) as any[];
  return rows.map(rowToRecord);
}

export function writeState(input: {
  conversationId: string;
  key: string;
  value: JsonValue;
  expectedVersion: number | null;
}): number {
  const conversationId = requireScopeId(input.conversationId, "conversationId");
  const key = requireText(input.key, "state key", 255);
  const encoded = encodeJson(input.value);

  if (input.expectedVersion === null) {
    try {
      db.prepare(`
        INSERT INTO aion_state_entries(
          id, conversation_id, entry_key, entry_value_json, version
        ) VALUES(?,?,?,?,1)
      `).run(crypto.randomUUID(), conversationId, key, encoded);
      return 1;
    } catch {
      throw new AionStateConflict();
    }
  }

  const result = db
    .prepare(
      `UPDATE aion_state_entries
       SET entry_value_json=?, version=version+1, updated_at=CURRENT_TIMESTAMP
       WHERE conversation_id=? AND entry_key=? AND version=?`
    )
    .run(encoded, conversationId, key, input.expectedVersion);

  if (result.changes !== 1) {
    throw new AionStateConflict();
  }
  return input.expectedVersion + 1;
}

export function readState(
  conversationId: string,
  key: string
): { value: JsonValue; version: number } | null {
  const scope = requireScopeId(conversationId, "conversationId");
  const k = requireText(key, "state key", 255);
  const row = db
    .prepare(
      "SELECT entry_value_json, version FROM aion_state_entries WHERE conversation_id=? AND entry_key=?"
    )
    .get(scope, k) as { entry_value_json: string; version: number } | undefined;
  if (!row) return null;
  return { value: JSON.parse(row.entry_value_json), version: row.version };
}

export function saveDecision(input: {
  conversationId: string;
  toolName: string;
  state: DecisionState;
  riskLevel: string;
  rationale: string;
  risks: string[];
  // `unknown` because the call site may pass raw tool-arg shapes from
  // JSON.parse that aren't strictly JsonValue at the type level; encodeJson
  // validates them at runtime.
  actionPayload: unknown;
  confidence: number;
  reversible: boolean;
  confirmationRequired: boolean;
}): DecisionRecord {
  const id = crypto.randomUUID();
  const conversationId = requireScopeId(input.conversationId, "conversationId");
  const toolName = requireText(input.toolName, "toolName", 128);
  const rationale = requireText(input.rationale, "rationale", 2000);
  const goal = `Execute ${input.toolName}`;
  const confidence = requireConfidence(input.confidence);
  const risksJson = encodeJson(input.risks);
  const actionPayloadJson = input.actionPayload == null
    ? null
    : encodeJson(input.actionPayload);

  db.prepare(`
    INSERT INTO aion_decision_contracts(
      id, conversation_id, tool_name, state, risk_level,
      goal, rationale, risks_json, action_payload_json,
      confidence, reversible, confirmation_required
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    id,
    conversationId,
    toolName,
    input.state,
    input.riskLevel,
    goal,
    rationale,
    risksJson,
    actionPayloadJson,
    confidence,
    input.reversible ? 1 : 0,
    input.confirmationRequired ? 1 : 0
  );

  const row = db
    .prepare("SELECT * FROM aion_decision_contracts WHERE id=?")
    .get(id) as any;
  return rowToDecision(row);
}

export function listDecisions(
  conversationId: string,
  limit = 20
): DecisionRecord[] {
  const scope = requireScopeId(conversationId, "conversationId");
  const bounded = Math.max(1, Math.min(100, Math.trunc(limit)));
  const rows = db
    .prepare(
      "SELECT * FROM aion_decision_contracts WHERE conversation_id=? ORDER BY created_at DESC, rowid DESC LIMIT ?"
    )
    .all(scope, bounded) as any[];
  return rows.map(rowToDecision);
}

/**
 * Global (cross-conversation) count of committed "costly" tool calls
 * (generate_video/generate_still/ugc_batch_generate/generate_blog_post)
 * since UTC midnight. Used to cap real spend against generation APIs —
 * counts tool INVOCATIONS, not raw assets: a single ugc_batch_generate
 * commit may itself produce several assets internally, so this bounds
 * how many times the tool was called, not a hard ceiling on every asset
 * ever produced by it.
 */
export function countCostlyCommitsToday(): number {
  const row = db
    .prepare(
      "SELECT COUNT(*) as n FROM aion_decision_contracts WHERE state='COMMIT' AND risk_level='costly' AND date(created_at) = date('now')"
    )
    .get() as { n: number };
  return row.n;
}

export function saveAudit(input: {
  conversationId: string;
  assistantMessageId: string | null;
  passed: boolean;
  flags: JsonValue;
}): AuditRecord {
  const id = crypto.randomUUID();
  const conversationId = requireScopeId(input.conversationId, "conversationId");
  const flagsJson = encodeJson(input.flags);

  db.prepare(`
    INSERT INTO aion_audits(
      id, conversation_id, assistant_message_id, passed, flags_json
    ) VALUES(?,?,?,?,?)
  `).run(
    id,
    conversationId,
    input.assistantMessageId,
    input.passed ? 1 : 0,
    flagsJson
  );

  const row = db.prepare("SELECT * FROM aion_audits WHERE id=?").get(id) as any;
  return rowToAudit(row);
}

export function listAudits(
  conversationId: string,
  limit = 20
): AuditRecord[] {
  const scope = requireScopeId(conversationId, "conversationId");
  const bounded = Math.max(1, Math.min(100, Math.trunc(limit)));
  const rows = db
    .prepare(
      "SELECT * FROM aion_audits WHERE conversation_id=? ORDER BY created_at DESC, rowid DESC LIMIT ?"
    )
    .all(scope, bounded) as any[];
  return rows.map(rowToAudit);
}

function rowToRecord(row: any): MemoryRecord {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    entityKey: row.entity_key,
    category: row.category as EpistemicCategory,
    content: JSON.parse(row.content_json) as JsonValue,
    confidence: row.confidence,
    source: row.source,
    createdAt: row.created_at
  };
}

function rowToDecision(row: any): DecisionRecord {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    toolName: row.tool_name,
    state: row.state as DecisionState,
    riskLevel: row.risk_level,
    goal: row.goal,
    rationale: row.rationale,
    risks: JSON.parse(row.risks_json) as string[],
    actionPayload: row.action_payload_json
      ? (JSON.parse(row.action_payload_json) as JsonValue)
      : null,
    confidence: row.confidence,
    reversible: row.reversible === 1,
    confirmationRequired: row.confirmation_required === 1,
    createdAt: row.created_at
  };
}

function rowToAudit(row: any): AuditRecord {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    assistantMessageId: row.assistant_message_id,
    passed: row.passed === 1,
    flags: JSON.parse(row.flags_json) as JsonValue,
    createdAt: row.created_at
  };
}
