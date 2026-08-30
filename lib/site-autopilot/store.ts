// Run-history log for the Site/IG autopilot pipeline — same rationale as
// lib/reddit-research/store.ts (a dedicated table, not AION's
// conversation-scoped memory, since these runs come from a background
// scheduler or a direct admin action, not a Claw chat turn).

import crypto from "node:crypto";
import { db } from "@/lib/db";

db.exec(`
CREATE TABLE IF NOT EXISTS site_autopilot_runs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK(status IN ('success','skipped','failed')),
  trigger TEXT NOT NULL CHECK(trigger IN ('scheduled','manual')),
  category TEXT,
  scheduled_post_id TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_site_autopilot_runs_created_at ON site_autopilot_runs(created_at);
`);

// `scene_summary` was added after the initial table shape — same
// ALTER-TABLE-if-missing pattern as lib/reddit-research/store.ts's `query`
// column. Holds the bare AI-authored scenario text from
// lib/cartoon-scene-writer.ts (never the full image prompt) so future runs
// — across this pipeline AND the Reddit research one — can avoid repeating it.
try {
  const cols = db.prepare("PRAGMA table_info(site_autopilot_runs)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "scene_summary")) db.exec("ALTER TABLE site_autopilot_runs ADD COLUMN scene_summary TEXT");
} catch { /* ignore */ }

export type SiteAutopilotRun = {
  id: string;
  status: "success" | "skipped" | "failed";
  trigger: "scheduled" | "manual";
  category: string | null;
  scheduledPostId: string | null;
  error: string | null;
  createdAt: string;
};

export function saveSiteAutopilotRun(input: {
  status: "success" | "skipped" | "failed";
  trigger: "scheduled" | "manual";
  category?: string | null;
  sceneSummary?: string | null;
  scheduledPostId?: string | null;
  error?: string | null;
}): SiteAutopilotRun {
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO site_autopilot_runs(id, status, trigger, category, scene_summary, scheduled_post_id, error) VALUES(?,?,?,?,?,?,?)`
  ).run(
    id,
    input.status,
    input.trigger,
    input.category ?? null,
    input.sceneSummary ? input.sceneSummary.slice(0, 500) : null,
    input.scheduledPostId ?? null,
    input.error ? input.error.slice(0, 2000) : null
  );
  const row = db.prepare("SELECT * FROM site_autopilot_runs WHERE id=?").get(id) as any;
  return rowToRun(row);
}

/** Recent AI-authored scene summaries from THIS pipeline's successful runs —
 *  see lib/reddit-research/store.ts's recentSceneSummaries for the shared
 *  rationale (both pipelines' history is combined so neither repeats the
 *  other's output either). */
export function recentSceneSummaries(limit = 20): { sceneSummary: string; createdAt: string }[] {
  const rows = db.prepare(
    `SELECT scene_summary, created_at FROM site_autopilot_runs WHERE status='success' AND scene_summary IS NOT NULL ORDER BY created_at DESC LIMIT ?`
  ).all(limit) as { scene_summary: string; created_at: string }[];
  return rows.map((r) => ({ sceneSummary: r.scene_summary, createdAt: r.created_at }));
}

export function listSiteAutopilotRuns(limit = 20): SiteAutopilotRun[] {
  const rows = db.prepare("SELECT * FROM site_autopilot_runs ORDER BY created_at DESC LIMIT ?").all(limit) as any[];
  return rows.map(rowToRun);
}

/** UTC-day guard for the autonomous scheduler, same semantics as
 *  lib/reddit-research/store.ts's hasScheduledRunToday. */
export function hasScheduledSiteRunToday(): boolean {
  const row = db.prepare(
    `SELECT COUNT(*) as n FROM site_autopilot_runs WHERE trigger='scheduled' AND date(created_at) = date('now')`
  ).get() as { n: number };
  return row.n > 0;
}

/** Which category (of the 6 cartoon-template categories) this pipeline
 *  most recently posted, so a new run can rotate to a different one
 *  instead of repeating — reused across runs regardless of trigger type. */
export function lastPostedCategory(): string | null {
  const row = db.prepare(
    `SELECT category FROM site_autopilot_runs WHERE status='success' AND category IS NOT NULL ORDER BY created_at DESC LIMIT 1`
  ).get() as { category: string } | undefined;
  return row?.category ?? null;
}

function rowToRun(row: any): SiteAutopilotRun {
  return {
    id: row.id,
    status: row.status,
    trigger: row.trigger,
    category: row.category,
    scheduledPostId: row.scheduled_post_id,
    error: row.error,
    createdAt: row.created_at
  };
}
