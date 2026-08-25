import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getCustomSplitTemplate } from "@/lib/custom-split-templates";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const template = getCustomSplitTemplate(id);
  if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });
  try {
    const bytes = await fs.readFile(template.filePath);
    const type = path.extname(template.filePath).toLowerCase() === ".png" ? "image/png" : "image/jpeg";
    return new NextResponse(new Uint8Array(bytes), { headers: { "content-type": type, "cache-control": "private, max-age=3600" } });
  } catch {
    return NextResponse.json({ error: "Template file not found" }, { status: 404 });
  }
}