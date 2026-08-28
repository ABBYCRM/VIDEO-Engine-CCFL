import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { saveUploadedVideo } from "@/lib/upper-videos";
import { saveBulkUploads } from "@/lib/bulk-upload";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const form = await req.formData();
    const multi = form.getAll("files").filter((v): v is File => v instanceof File);
    const single = form.get("file");

    // Bulk path: two or more files under "files". Kept separate from the
    // single-file path below so an existing caller passing a custom `id`
    // for one file keeps its exact prior behavior.
    if (multi.length > 1 || (multi.length === 1 && !(single instanceof File))) {
      const label = String(form.get("label") || "Campaign upper-lane video");
      const titlePrefix = form.get("title") ? String(form.get("title")) : undefined;
      const { ok, failed } = await saveBulkUploads(multi, { mediaType: "video", label, titlePrefix });
      if (!ok.length) return NextResponse.json({ error: failed[0]?.error || "Upload failed" }, { status: 400 });
      return NextResponse.json({ ok: true, uploaded: ok, failed }, { status: 201 });
    }

    const file = single instanceof File ? single : multi[0];
    if (!(file instanceof File)) return NextResponse.json({ error: "A video file is required" }, { status: 400 });
    if (!file.type.startsWith("video/")) return NextResponse.json({ error: "Upload a video file" }, { status: 400 });
    if (file.size < 1 || file.size > 250 * 1024 * 1024) return NextResponse.json({ error: "Video must be between 1 byte and 250MB" }, { status: 400 });
    const saved = await saveUploadedVideo({
      bytes: Buffer.from(await file.arrayBuffer()),
      title: String(form.get("title") || file.name).slice(0, 180),
      mimeType: file.type,
      label: String(form.get("label") || "Campaign upper-lane video"),
      id: form.get("id") ? String(form.get("id")) : undefined
    });
    return NextResponse.json(saved, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
