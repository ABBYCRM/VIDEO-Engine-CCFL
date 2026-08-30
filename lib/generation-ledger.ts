// Unified daily cap on real-money generation calls (generate_video,
// generate_still, ugc_batch_generate, generate_blog_post), enforced across
// every surface that can trigger one — not just Claw's own chat loop.
//
// Chat-driven commits are already recorded in aion_decision_contracts by
// lib/claw/runtime.ts (via lib/aion/store.ts's saveDecision), since every
// chat tool call goes through AION's decideTool() gate. Autonomous
// background pipelines (Reddit market-research, Site/IG autopilot) call
// generateCampaignStill() directly and never touch that gate — by design,
// the whole point of an autonomous pipeline is that it doesn't wait on a
// conversation. Without this module, a background pipeline's spend would
// be invisible to the cap chat commits are checked against, so the two
// could add up to well over the configured daily limit. This module gives
// background pipelines their own ledger and sums both counts, so
// DAILY_GENERATION_LIMIT bounds total spend regardless of which surface
// triggered it.

import crypto from "node:crypto";
import { db } from "@/lib/db";
import { countCostlyCommitsToday } from "@/lib/aion/store";

db.exec(`
CREATE TABLE IF NOT EXISTS background_generation_commits (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_background_generation_commits_created_at ON background_generation_commits(created_at);
`);

export const DAILY_GENERATION_LIMIT = (() => {
  const raw = Number(process.env.CLAW_DAILY_GENERATION_LIMIT);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 15;
})();

/** Call once, right after a background pipeline's generateCampaignStill
 *  (or equivalent) call actually succeeds — never before, and never for a
 *  call that was skipped or failed. `source` is a short label
 *  ("reddit-research", "site-autopilot") for the run-history/ledger, not
 *  used for any logic. */
export function recordBackgroundGenerationCommit(source: string) {
  db.prepare("INSERT INTO background_generation_commits(id, source) VALUES(?,?)").run(crypto.randomUUID(), source);
}

function countBackgroundGenerationCommitsToday(): number {
  const row = db.prepare(
    "SELECT COUNT(*) as n FROM background_generation_commits WHERE date(created_at) = date('now')"
  ).get() as { n: number };
  return row.n;
}

/** The number every caller — Claw's chat loop and every autonomous
 *  background pipeline — should check against DAILY_GENERATION_LIMIT
 *  before committing a new generation call. */
export function countAllGenerationCommitsToday(): number {
  return countCostlyCommitsToday() + countBackgroundGenerationCommitsToday();
}
