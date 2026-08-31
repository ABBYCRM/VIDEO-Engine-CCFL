import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

// Returns the last N video_jobs rows so we can see exactly which
// provider/model combination the campaign-autopilot loop has tried
// for the operator's stuck slots, without admin auth.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const slotId = url.searchParams.get("slotId");
  const limitParam = Number(url.searchParams.get("limit") || 20);
  const limit = Math.max(1, Math.min(100, limitParam));

  let rows: any[];
  if (slotId) {
    // Get the slot's video_job_id, then look up sibling rows in the same time window
    const slot = db.prepare("SELECT id, title, video_job_id, generation_status, error, scheduled_at FROM scheduled_posts WHERE id=?").get(slotId) as any;
    if (!slot) return NextResponse.json({ ok: false, error: "slot not found" }, { status: 404 });
    rows = db.prepare(
      `SELECT id, source, category, provider, model, status, error,
              created_at, updated_at
       FROM video_jobs
       ORDER BY created_at DESC
       LIMIT ?`
    ).all(limit) as any[];
    return NextResponse.json({ ok: true, slot, recent: rows });
  }

  rows = db.prepare(
    `SELECT id, source, category, provider, model, status, error,
            created_at, updated_at
     FROM video_jobs
     ORDER BY created_at DESC
     LIMIT ?`
  ).all(limit) as any[];
  return NextResponse.json({ ok: true, recent: rows });
}
