import { NextResponse } from "next/server";
import { requireAdmin, unauthorized } from "@/lib/auth";
import { verifyApiToken } from "@/lib/tokens";
import { createJob, listRecentJobs } from "@/lib/jobs";
import { parseGenerationBody } from "@/lib/request";

export const runtime = "nodejs";

function token(req: Request) {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7) : "";
}

export async function GET(req: Request) {
  const authorized = (await requireAdmin()) || verifyApiToken(token(req));
  if (!authorized) return unauthorized();
  return NextResponse.json({
    jobs: listRecentJobs(20).map((job) => ({
      id: job.id,
      category: job.category,
      provider: job.provider,
      status: job.status,
      error: job.error,
      durationSeconds: 8,
      oneShot: true,
      fileUrl: job.status === "succeeded" ? `/api/v1/video/${job.id}/file` : null,
      createdAt: job.createdAt,
    })),
  });
}

export async function POST(req: Request) {
  const authorized = (await requireAdmin()) || verifyApiToken(token(req));
  if (!authorized) return unauthorized();
  try {
    const input = parseGenerationBody(await req.json());
    const job = await createJob({ ...input, source: "api" });
    return NextResponse.json({
      id: job.id,
      status: job.status,
      statusUrl: `/api/v1/video/${job.id}`,
      durationSeconds: 8,
      oneShot: true,
    }, { status: 202 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
