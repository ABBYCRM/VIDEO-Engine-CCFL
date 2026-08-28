import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureUpperVideoColumns, parseUpperVideoIds, saveDefaultUpperVideoIds } from "@/lib/upper-videos";
import { filesFromForm, saveBulkUploads } from "@/lib/bulk-upload";

ensureUpperVideoColumns();

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const current = db.prepare("SELECT id, upper_video_ids FROM campaigns WHERE id=?").get(id) as { id: string; upper_video_ids: string | null } | undefined;
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const form = await req.formData();
    const files = filesFromForm(form);
    if (!files.length) return NextResponse.json({ error: "Upload one or more top-lane videos" }, { status: 400 });
    const { ok, failed } = await saveBulkUploads(files, { mediaType: "video", label: "Campaign upper-lane video" });
    if (!ok.length) return NextResponse.json({ error: failed[0]?.error || "Upload failed" }, { status: 400 });
    const ids = parseUpperVideoIds(current.upper_video_ids);
    for (const saved of ok) if (!ids.includes(saved.id)) ids.push(saved.id);
    db.prepare("UPDATE campaigns SET upper_video_ids=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(JSON.stringify(ids), id);
    if (form.get("asDefault") === "1" || form.get("asDefault") === "true") saveDefaultUpperVideoIds(ids);
    return NextResponse.json({ ok: true, upperVideoIds: ids, uploaded: ok, failed });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
