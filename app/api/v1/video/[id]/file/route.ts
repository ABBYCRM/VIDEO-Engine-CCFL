import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { verifyApiToken } from "@/lib/tokens";
import { getJob } from "@/lib/jobs";
function bearer(req: Request) { const h = req.headers.get("authorization") || ""; return h.startsWith("Bearer ") ? h.slice(7) : ""; }
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authorized = (await requireAdmin()) || verifyApiToken(bearer(req));
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params; const job = getJob(id);
  if (!job || job.status !== "succeeded" || !job.outputPath) return NextResponse.json({ error: "Video not ready" }, { status: 404 });
  const bytes = await fs.readFile(job.outputPath);
  return new NextResponse(bytes, { headers: { "content-type": "video/mp4", "content-disposition": `inline; filename=\"${id}.mp4\"`, "cache-control": "private, max-age=3600" } });
}
