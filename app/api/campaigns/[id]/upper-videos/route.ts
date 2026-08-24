import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureUpperVideoColumns, parseUpperVideoIds, saveDefaultUpperVideoIds, saveUploadedVideo } from "@/lib/upper-videos";

ensureUpperVideoColumns();

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const current = db.prepare("SELECT id, upper_video_ids FROM campaigns WHERE id=?").get(id) as { id: string; upper_video_ids: string | null } | undefined;
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const form = await req.formData();
    const files = form.getAll("files").filter((value): value is File => value instanceof File);
    const single = form.get("file");
    if (single instanceof File) files.push(single);
    if (!files.length) return NextResponse.json({ error: "Upload one or more top-lane videos" }, { status: 400 });
    const ids = parseUpperVideoIds(current.upper_video_ids);
    for (const file of files) {
      if (!file.type.startsWith("video/")) return NextResponse.json({ error: `${file.name} is not a video` }, { status: 400 });
      if (file.size < 1 || file.size > 250 * 1024 * 1024) return NextResponse.json({ error: `${file.name} must be 250MB or smaller` }, { status: 400 });
      const saved = await saveUploadedVideo({
        bytes: Buffer.from(await file.arrayBuffer()),
        title: file.name,
        mimeType: file.type,
        label: "Campaign upper-lane video"
      });
      if (!ids.includes(saved.id)) ids.push(saved.id);
    }
    db.prepare("UPDATE campaigns SET upper_video_ids=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(JSON.stringify(ids), id);
    if (form.get("asDefault") === "1" || form.get("asDefault") === "true") saveDefaultUpperVideoIds(ids);
    return NextResponse.json({ ok: true, upperVideoIds: ids });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
