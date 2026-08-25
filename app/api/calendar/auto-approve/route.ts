import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { runCalendarPublisherOnce, startCalendarPublisherLoop } from "@/lib/calendar-publisher";

export async function POST() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = db.prepare(`
    UPDATE scheduled_posts
    SET status='approved', auto_post=1, updated_at=CURRENT_TIMESTAMP
    WHERE status IN ('draft','pending')
      AND (network='instagram' OR network='website')
      AND (generation_status IS NULL OR generation_status IN ('ready','generating','pending'))
  `).run();
  const approved = result.changes;
  startCalendarPublisherLoop();
  setTimeout(() => { void runCalendarPublisherOnce(); }, 0);
  return NextResponse.json({ ok: true, approved, message: `${approved} items approved with auto-post enabled. The publisher will handle due items automatically.` });
}
