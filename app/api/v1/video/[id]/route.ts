import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { verifyApiToken } from "@/lib/tokens";
import { refreshJob } from "@/lib/jobs";
function bearer(req: Request) { const h = req.headers.get("authorization") || ""; return h.startsWith("Bearer ") ? h.slice(7) : ""; }
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authorized = (await requireAdmin()) || verifyApiToken(bearer(req));
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params; const job = await refreshJob(id);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    id: job.id,
    category: job.category,
    provider: job.provider,
    model: job.model,
    status: job.status,
    error: job.error,
    durationSeconds: 8,
    oneShot: true,
    fileUrl: job.status === "succeeded" ? `/api/v1/video/${job.id}/file` : null,
    createdAt: job.createdAt
  });
}
