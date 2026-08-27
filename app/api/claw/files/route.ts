import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getConversation, listFiles, saveClawFile } from "@/lib/claw/store";

export const runtime = "nodejs";

export async function GET(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const conversationId = url.searchParams.get("conversationId");
  return NextResponse.json({ files: listFiles(conversationId) });
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "file is required" }, { status: 400 });
  if (file.size === 0) return NextResponse.json({ error: "File is empty" }, { status: 400 });
  if (file.size > 25 * 1024 * 1024) return NextResponse.json({ error: "File too large (25MB max)" }, { status: 400 });
  const conversationId = form.get("conversationId") ? String(form.get("conversationId")) : null;
  if (conversationId && !getConversation(conversationId)) return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  const bytes = Buffer.from(await file.arrayBuffer());
  const saved = await saveClawFile({
    conversationId,
    name: file.name,
    mime: file.type || "application/octet-stream",
    bytes
  });
  return NextResponse.json({ file: saved }, { status: 201 });
}
