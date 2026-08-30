// Run-history log for the Reddit market-research pipeline. Deliberately a
// dedicated table rather than reusing AION's conversation-scoped memory
// (aion_epistemic_records) — these runs are triggered by a background
// scheduler or a direct admin action, not a Claw chat turn, so there is no
// real conversation_id to anchor them to. `theme_summary` is safe to store
// verbatim: by the time a run reaches this table its content has already
// passed through the anonymization boundary (lib/reddit-research/anonymize.ts)
// and NVIDIA's aggregate-only synthesis — it holds a theme label, never a
// quoted post or username.

import crypto from "node:crypto";
import { db } from "@/lib/db";

db.exec(`
CREATE TABLE IF NOT EXISTS reddit_research_runs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK(status IN ('success','skipped','failed')),
  trigger TEXT NOT NULL CHECK(trigger IN ('scheduled','manual')),
  posts_scanned INTEGER NOT NULL DEFAULT 0,
  comments_scanned INTEGER NOT NULL DEFAULT 0,
  category TEXT,
  theme_summary TEXT,
  scheduled_post_id TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_reddit_research_runs_created_at ON reddit_research_runs(created_at);
`);

// `query` and `scene_summary` were added after the initial table shape —
// same ALTER-TABLE-if-missing pattern used throughout this codebase (e.g.
// lib/calendar-assets.ts) rather than a new migration number per column.
// `scene_summary` holds the bare AI-authored scenario text (never the full
// image prompt, which also carries the locked CHARACTERS/STYLE_BLOCK
// boilerplate) from lib/cartoon-scene-writer.ts, so future runs — across
// this pipeline AND the Site autopilot one — can be told what's already
// been used and avoid repeating it.
try {
  const cols = db.prepare("PRAGMA table_info(reddit_research_runs)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "query")) db.exec("ALTER TABLE reddit_research_runs ADD COLUMN query TEXT");
  if (!cols.some((c) => c.name === "scene_summary")) db.exec("ALTER TABLE reddit_research_runs ADD COLUMN scene_summary TEXT");
} catch { /* ignore */ }

export type RedditResearchRun = {
  id: string;
  status: "success" | "skipped" | "failed";
  trigger: "scheduled" | "manual";
  postsScanned: number;
  commentsScanned: number;
  query: string | null;
  category: string | null;
  themeSummary: string | null;
  scheduledPostId: string | null;
  error: string | null;
  createdAt: string;
};

export function saveRedditResearchRun(input: {
  status: "success" | "skipped" | "failed";
  trigger: "scheduled" | "manual";
  postsScanned: number;
  commentsScanned: number;
  query?: string | null;
  category?: string | null;
  themeSummary?: string | null;
  sceneSummary?: string | null;
  scheduledPostId?: string | null;
  error?: string | null;
}): RedditResearchRun {
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO reddit_research_runs(
      id, status, trigger, posts_scanned, comments_scanned, query, category, theme_summary, scene_summary, scheduled_post_id, error
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    id,
    input.status,
    input.trigger,
    input.postsScanned,
    input.commentsScanned,
    input.query ?? null,
    input.category ?? null,
    input.themeSummary ? input.themeSummary.slice(0, 2000) : null,
    input.sceneSummary ? input.sceneSummary.slice(0, 500) : null,
    input.scheduledPostId ?? null,
    input.error ? input.error.slice(0, 2000) : null
  );
  const row = db.prepare("SELECT * FROM reddit_research_runs WHERE id=?").get(id) as any;
  return rowToRun(row);
}

/** Recent AI-authored scene summaries from THIS pipeline's successful runs,
 *  most recent first — feeds lib/cartoon-scene-writer.ts's "already used, do
 *  not repeat" list. Combined with the Site autopilot pipeline's own recent
 *  scenes (lib/cartoon-scene-writer.ts's getRecentCartoonSceneSummaries) so
 *  neither pipeline repeats the other's output either. */
export function recentSceneSummaries(limit = 20): { sceneSummary: string; createdAt: string }[] {
  const rows = db.prepare(
    `SELECT scene_summary, created_at FROM reddit_research_runs WHERE status='success' AND scene_summary IS NOT NULL ORDER BY created_at DESC LIMIT ?`
  ).all(limit) as { scene_summary: string; created_at: string }[];
  return rows.map((r) => ({ sceneSummary: r.scene_summary, createdAt: r.created_at }));
}

export function listRedditResearchRuns(limit = 20): RedditResearchRun[] {
  const rows = db.prepare("SELECT * FROM reddit_research_runs ORDER BY created_at DESC LIMIT ?").all(limit) as any[];
  return rows.map(rowToRun);
}

/** UTC-day guard for the autonomous scheduler: has a scheduled run already
 *  landed (success OR failed — a failure still counts as "tried today", so
 *  a flaky upstream doesn't cause repeated hammering within the same day)
 *  today? Manual runs never count against this cap. */
export function hasScheduledRunToday(): boolean {
  const row = db.prepare(
    `SELECT COUNT(*) as n FROM reddit_research_runs WHERE trigger='scheduled' AND date(created_at) = date('now')`
  ).get() as { n: number };
  return row.n > 0;
}

function rowToRun(row: any): RedditResearchRun {
  return {
    id: row.id,
    status: row.status,
    trigger: row.trigger,
    postsScanned: row.posts_scanned,
    commentsScanned: row.comments_scanned,
    query: row.query,
    category: row.category,
    themeSummary: row.theme_summary,
    scheduledPostId: row.scheduled_post_id,
    error: row.error,
    createdAt: row.created_at
  };
}
