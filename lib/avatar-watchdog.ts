// lib/avatar-watchdog.ts
// Background watchdog that scans for avatar views stuck in
// generation_status='generating' beyond the timeout window, and force-flips
// them to 'failed' with a clear error message. This is the safety net
// for when the in-process AbortController / Promise.race timeout doesn't
// fire (e.g. because the Next.js server reaped the worker between requests,
// or because the upstream never returns headers and Node's setTimeout
// callback doesn't get a chance to run).
//
// Usage:
//   - Auto-started from lib/db.ts: when a row is set to 'generating' and
//     2 minutes pass without a corresponding 'ready' or 'failed' update,
//     the watchdog will mark it failed and write a 'reset by watchdog'
//     error to the row.
//   - Also exposed as a manual call: runWatchdog() from /api/admin/avatars/[id]/reset
//     so the operator can clear stuck state immediately after a deploy.

import { db } from "@/lib/db";

const STALE_MS = 2 * 60 * 1000; // 2 minutes

export function runWatchdog(): { reset: number; checked: number } {
  const cutoff = new Date(Date.now() - STALE_MS).toISOString();
  const stuck = db.prepare(
    "SELECT avatar_id, view, generation_started_at FROM avatar_views WHERE generation_status='generating' AND (generation_started_at IS NULL OR generation_started_at < ?)"
  ).all(cutoff) as Array<{ avatar_id: string; view: string; generation_started_at: string | null }>;
  if (!stuck.length) return { reset: 0, checked: 0 };
  const upd = db.prepare(
    "UPDATE avatar_views SET generation_status='failed', generation_error=COALESCE(generation_error, 'watchdog: no progress in 2 min'), generation_finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE avatar_id=? AND view=? AND generation_status='generating'"
  );
  let reset = 0;
  for (const s of stuck) {
    upd.run(s.avatar_id, s.view);
    reset++;
  }
  // Roll any avatar-level turnaround to incomplete if it was 'generating'
  db.prepare(
    "UPDATE avatars SET turnaround_status=CASE WHEN turnaround_status='generating' THEN 'incomplete' ELSE turnaround_status END, turnaround_error=COALESCE(turnaround_error, 'watchdog: partial generation timed out'), turnaround_finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE turnaround_status='generating'"
  ).run();
  return { reset, checked: stuck.length };
}

let intervalHandle: NodeJS.Timeout | null = null;

export function startWatchdogLoop(intervalMs = 60 * 1000): void {
  if (intervalHandle) return;
  // Run once on startup so a freshly-redeployed container clears any
  // rows that were stuck before the process restarted.
  try { runWatchdog(); } catch {}
  intervalHandle = setInterval(() => {
    try { runWatchdog(); } catch (e) {
      console.error("avatar-watchdog error:", e);
    }
  }, intervalMs);
  // Don't keep the process alive just for the watchdog.
  if (typeof intervalHandle.unref === "function") intervalHandle.unref();
}
