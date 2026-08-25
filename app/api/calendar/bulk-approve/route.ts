// Bulk approve all pending posts and set autoPost=1 so the calendar publisher fires them
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import "@/lib/calendar-assets";

export async function POST() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = db.prepare(
      `UPDATE scheduled_posts 
       SET status='approved', auto_post=1, updated_at=CURRENT_TIMESTAMP 
       WHERE status IN ('pending','draft') AND auto_post=0`
    ).run();
    return NextResponse.json({ 
      ok: true, 
      approved: result.changes,
      message: `${result.changes} posts flipped to approved + auto_post`
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
