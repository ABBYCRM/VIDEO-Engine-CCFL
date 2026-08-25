import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { publicCaptionForSlot } from "@/lib/public-copy";

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const horizonDays = Number(body.horizonDays || 60);
  if (horizonDays !== 60) return NextResponse.json({ error: "Only the 60-day protected spread is supported." }, { status: 400 });

  const rows = db.prepare("SELECT id, title, category, caption FROM scheduled_posts WHERE status != 'published' ORDER BY scheduled_at ASC, created_at ASC").all() as Array<{ id: string; title: string; category?: string | null; caption?: string | null }>;
  const update = db.prepare("UPDATE scheduled_posts SET scheduled_at=?, planning_horizon_days=?, caption=?, updated_at=CURRENT_TIMESTAMP WHERE id=?");
  const start = new Date();
  for (let index = 0; index < rows.length; index++) {
    const dayOffset = rows.length <= 1 ? 1 : 1 + Math.round(index * (horizonDays - 1) / (rows.length - 1));
    const scheduledAt = new Date(start);
    scheduledAt.setDate(scheduledAt.getDate() + dayOffset);
    scheduledAt.setHours(10, 0, 0, 0);
    const row = rows[index];
    const caption = publicCaptionForSlot({ category: row.category, title: row.title, caption: row.caption }).caption;
    update.run(scheduledAt.toISOString(), horizonDays, caption, row.id);
  }
  return NextResponse.json({ ok: true, rescheduled: rows.length, horizonDays, message: String(rows.length) + " unpublished calendar items are now evenly spaced across 60 days. Existing media was not deleted or regenerated." });
}
