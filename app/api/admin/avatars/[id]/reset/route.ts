// Recovery endpoint for stuck "generating" view state.
// When a Gemini/NVIDIA/OpenAI call hangs past the 90s AbortController
// (or the worker process is killed mid-flight), the avatar_views row can
// stay at generation_status='generating' forever. This endpoint flips any
// view that's been generating for more than `staleMs` (default 5 min) back
// to 'idle' so the operator can retry.
//
//   POST /api/admin/avatars/[id]/reset
//   POST /api/admin/avatars/[id]/reset?staleMs=120000
//
// No-op if no views are stale.

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const url = new URL(req.url);
  const staleMs = Number(url.searchParams.get("staleMs") || 5 * 60 * 1000); // default 5 min
  const cutoff = new Date(Date.now() - staleMs).toISOString();

  // Count stuck rows before
  const stuck = db.prepare(
    "SELECT view, generation_started_at FROM avatar_views WHERE avatar_id=? AND generation_status='generating' AND (generation_started_at IS NULL OR generation_started_at < ?)"
  ).all(id, cutoff) as Array<{ view: string; generation_started_at: string | null }>;

  // Reset them
  const upd = db.prepare(
    "UPDATE avatar_views SET generation_status='idle', generation_error=COALESCE(generation_error, 'reset by admin recovery'), generation_finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE avatar_id=? AND generation_status='generating'"
  ).run(id);

  // Also roll the avatar-level turnaround back to draft if it was 'generating'
  db.prepare(
    "UPDATE avatars SET turnaround_status=CASE WHEN turnaround_status='generating' THEN 'incomplete' ELSE turnaround_status END, turnaround_error=COALESCE(turnaround_error, 'partial generation reset by admin'), turnaround_finished_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?"
  ).run(id);

  return NextResponse.json({
    ok: true,
    avatarId: id,
    resetViews: upd.changes,
    stuckRows: stuck.map(s => s.view),
    cutoff
  });
}
