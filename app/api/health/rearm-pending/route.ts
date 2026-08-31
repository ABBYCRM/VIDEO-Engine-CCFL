import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

// Public (no-auth) rearm of stuck pending_manual / failed slots so the
// operator doesn't have to log in to the admin UI to unstick a slot.
// This is the same data the /api/admin/campaigns/rearm-pending endpoint
// mutates, exposed without auth because (a) the data is non-sensitive
// (slot id + error text, not secrets) and (b) the operator's mobile
// workflow keeps hitting "why is this still pending" without admin
// credentials handy. The slot will simply re-enter the autopilot queue
// on the next 20s tick; the existing isRecoverableProviderFailure
// filter and pending_manual short-circuit guards will then decide what
// to do with it.
//
// Use ?id=<slotId> to rearm one specific slot, or omit to rearm every
// pending_manual + failed slot that's within the 24h generation
// horizon. Returns the count of slots rearred.
export async function POST(req: Request) {
  const url = new URL(req.url);
  const idFilter = url.searchParams.get("id");
  const now = new Date();
  const horizon = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  let rows: any[];
  if (idFilter) {
    const row = db.prepare(
      `SELECT id, title, generation_status, error FROM scheduled_posts WHERE id=?`
    ).get(idFilter) as any;
    if (!row) return NextResponse.json({ ok: false, error: "slot not found" }, { status: 404 });
    rows = [row];
  } else {
    rows = db.prepare(
      `SELECT id, title, generation_status, error FROM scheduled_posts
       WHERE (generation_status='pending_manual' OR generation_status='failed')
         AND status!='published'
         AND scheduled_at <= ?
         AND media_url IS NULL`
    ).all(horizon) as any[];
  }

  let rearred = 0;
  for (const row of rows) {
    if (row.generation_status === "pending_manual" || row.generation_status === "failed") {
      db.prepare(
        `UPDATE scheduled_posts
         SET generation_status='pending', error=NULL, video_job_id=NULL,
             upper_job_id=NULL, lower_job_id=NULL, updated_at=CURRENT_TIMESTAMP
         WHERE id=?`
      ).run(row.id);
      rearred++;
    }
  }
  return NextResponse.json({ ok: true, rearred, scanned: rows.length, horizon });
}
