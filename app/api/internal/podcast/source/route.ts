import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Video file is required" }, { status: 400 });
  const allowed = ["video/mp4", "video/webm", "video/quicktime"];
  if (!allowed.includes(file.type)) return NextResponse.json({ error: "Use MP4, WebM, or MOV video" }, { status: 400 });
  if (file.size <= 0 || file.size > 200 * 1024 * 1024) return NextResponse.json({ error: "Video must be 200MB or smaller" }, { status: 400 });
  const id = crypto.randomUUID();
  const ext = file.type === "video/webm" ? ".webm" : file.type === "video/quicktime" ? ".mov" : ".mp4";
  const dir = path.resolve(process.env.VIDEO_UPLOAD_DIR || "./data/uploads");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${id}${ext}`), Buffer.from(await file.arrayBuffer()));
  return NextResponse.json({ id });
}
