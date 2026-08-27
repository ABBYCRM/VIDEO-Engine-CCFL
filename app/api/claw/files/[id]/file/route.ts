import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getFile } from "@/lib/claw/store";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const file = getFile(id);
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    await stat(file.path);
  } catch {
    return NextResponse.json({ error: "File missing on disk" }, { status: 404 });
  }
  const stream = Readable.toWeb(createReadStream(file.path)) as ReadableStream;
  return new NextResponse(stream, {
    headers: {
      "content-type": file.mime || "application/octet-stream",
      "content-disposition": `attachment; filename="${encodeURIComponent(file.name)}"`,
      "cache-control": "private, max-age=60",
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox; default-src 'none'"
    }
  });
}
