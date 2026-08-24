import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { saveUploadedVideo } from "@/lib/upper-videos";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const form = await req.formData();
    const file = form.get("file");
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
