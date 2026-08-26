import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** Requeue every unpublished future campaign video from a clean state.
 * Old compositions are detached and stale lane/job ids are cleared so stock
 * selection, prompt hardening, and current split geometry all run again. */
export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const now = body?.from ? new Date(String(body.from)) : new Date();
  if (Number.isNaN(now.getTime())) return NextResponse.json({ error: "Invalid from date" }, { status: 400 });

  const rows = db.prepare(`
    SELECT id,title,scheduled_at,generation_status,media_url,source_asset_key
    FROM scheduled_posts
    WHERE campaign_id IS NOT NULL
      AND content_type='podcast'
      AND status!='published'
      AND scheduled_at>=?
    ORDER BY scheduled_at ASC
  `).all(now.toISOString()) as any[];

  const update = db.prepare(`
    UPDATE scheduled_posts
    SET generation_status='pending',
        media_url=NULL,
        media_type=NULL,
        source_asset_key=NULL,
        video_job_id=NULL,
        upper_job_id=NULL,
        lower_job_id=NULL,
        error=NULL,
        publishing_at=NULL,
        updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND status!='published'
  `);
  const tx = db.transaction((items: any[]) => {
    let changed = 0;
    for (const row of items) changed += update.run(row.id).changes;
    return changed;
  });
  const changed = tx(rows);
  return NextResponse.json({
    ok: true,
    changed,
    detachedPriorCompositions: rows.filter((r) => r.media_url || r.source_asset_key).length,
    slots: rows.map((r) => ({
      id: r.id,
      title: r.title,
      scheduledAt: r.scheduled_at,
      priorGenerationStatus: r.generation_status
    }))
  });
}