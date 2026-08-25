import fs from "node:fs";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyPublishedMedia } from "@/lib/publish-media";
import { ensureJobOutputPath } from "@/lib/jobs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const expiresAt = Number(url.searchParams.get("expires") || 0);
  const sig = String(url.searchParams.get("sig") || "");
  if (!verifyPublishedMedia(id, expiresAt, sig)) return new NextResponse("Forbidden", { status: 403 });

  const row = db.prepare("SELECT status FROM video_jobs WHERE id=?").get(id) as { status?: string } | undefined;
  if (!row || row.status !== "succeeded") return new NextResponse("Not found", { status: 404 });
  const outputPath = await ensureJobOutputPath(id);
  if (!outputPath || !fs.existsSync(outputPath)) return new NextResponse("Not found", { status: 404 });
  const stat = fs.statSync(outputPath);
  const stream = fs.createReadStream(outputPath);
  return new NextResponse(stream as any, {
    headers: {
      "content-type": "video/mp4",
      "content-length": String(stat.size),
      "cache-control": "public, max-age=300",
      "content-disposition": `inline; filename="${id}.mp4"`
    }
  });
}
