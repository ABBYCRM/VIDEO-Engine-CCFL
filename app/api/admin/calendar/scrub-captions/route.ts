// One-time cleanup: scrub operator-language captions from existing scheduled_posts
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { publicCaptionForSlot, isOperatorCopy } from "@/lib/public-copy";

export async function POST() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const rows = db.prepare("SELECT id, title, category, caption FROM scheduled_posts WHERE caption IS NOT NULL AND caption != ''").all() as any[];
    let fixed = 0;
    const sample: any[] = [];
    for (const row of rows) {
      if (isOperatorCopy(row.caption)) {
        const clean = publicCaptionForSlot({ category: row.category || "car_accident", title: row.title });
        db.prepare("UPDATE scheduled_posts SET caption=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(clean.caption, row.id);
        fixed++;
        if (sample.length < 3) sample.push({ id: row.id, title: row.title, newCaption: clean.caption.slice(0, 200) + "..." });
      }
    }
    return NextResponse.json({ ok: true, scanned: rows.length, fixed, sample });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
