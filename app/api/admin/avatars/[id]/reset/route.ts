// Recovery endpoint for stuck "generating" view state.
// When a Gemini/NVIDIA/OpenAI call hangs past the in-process AbortController
// (or the worker process is killed mid-flight), the avatar_views row can
// stay at generation_status='generating' forever. This endpoint flips any
// view that's been generating for more than `staleMs` (default 2 min) back
// to 'failed' so the operator can retry.
//
//   POST /api/admin/avatars/[id]/reset
//   POST /api/admin/avatars/[id]/reset?staleMs=120000   (2 min)
//   POST /api/admin/avatars/[id]/reset?all=true         (force-reset every
//                                                       stuck view, even
//                                                       if it's not stale)
//
// Also kicks the global watchdog so ALL stale rows across all avatars
// get reset in the same call — useful after a deploy when a single
// reset wouldn't be enough.

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { runWatchdog } from "@/lib/avatar-watchdog";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const url = new URL(req.url);
  const staleMs = Number(url.searchParams.get("staleMs") || 2 * 60 * 1000); // 2 min
  const all = url.searchParams.get("all") === "true";
  const cutoff = new Date(Date.now() - staleMs).toISOString();

  // Per-avatar: stale rows (or all rows if all=true)
  const stuck = db.prepare(
    all
      ? "SELECT view, generation_started_at FROM avatar_views WHERE avatar_id=? AND generation_status='generating'"
      : "SELECT view, generation_started_at FROM avatar_views WHERE avatar_id=? AND generation_status='generating' AND (generation_started_at IS NULL OR generation_started_at < ?)"
  ).all(...(all ? [id] : [id, cutoff])) as Array<{ view: string; generation_started_at: string | null }>;

  const upd = db.prepare(
    "UPDATE avatar_views SET generation_status='failed', generation_error=COALESCE(generation_error, 'reset by admin recovery'), generation_finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE avatar_id=? AND generation_status='generating'"
  ).run(id);

  db.prepare(
    "UPDATE avatars SET turnaround_status=CASE WHEN turnaround_status='generating' THEN 'incomplete' ELSE turnaround_status END, turnaround_error=COALESCE(turnaround_error, 'partial generation reset by admin'), turnaround_finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?"
  ).run(id);

  // Global watchdog: reset stale rows for any OTHER avatar too
  const wd = runWatchdog();

  return NextResponse.json({
    ok: true,
    avatarId: id,
    resetViews: upd.changes,
    stuckRows: stuck.map(s => s.view),
    cutoff,
    watchdog: wd
  });
}
