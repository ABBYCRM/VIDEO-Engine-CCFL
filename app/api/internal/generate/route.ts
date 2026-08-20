import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createJob } from "@/lib/jobs";
import { parseGenerationBody } from "@/lib/request";
export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { const input = parseGenerationBody(await req.json()); const job = await createJob({ ...input, source: "admin" }); return NextResponse.json({ job: publicJob(job) }, { status: 202 }); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 }); }
}
function publicJob(j: any) { return { id: j.id, category: j.category, status: j.status, error: j.error, createdAt: j.createdAt, fileUrl: j.status === "succeeded" ? `/api/v1/video/${j.id}/file` : null }; }
