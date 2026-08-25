import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createJob } from "@/lib/jobs";
import { parseGenerationBody } from "@/lib/request";
import { contentTemplates, type ContentTemplateId } from "@/lib/prompts";

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const templateId = body?.template as ContentTemplateId | undefined;
    if (templateId && contentTemplates[templateId]) {
      const tmpl = contentTemplates[templateId];
      body.category = "ugc";
      body.mission = `HYPER-REALISTIC ${tmpl.title}. ${tmpl.instruction} ${body.prompt || ""}`.trim();
      body.aspectRatio = body.aspectRatio || tmpl.aspectRatio;
      body.durationSeconds = body.durationSeconds || tmpl.duration;
      if (!body.model) body.model = "grok-imagine-video-1.5";
      if (!body.provider) body.provider = "grok";
    }
    const input = parseGenerationBody(body);
    const job = await createJob({ ...input, source: "admin" });
    return NextResponse.json({ job: publicJob(job) }, { status: 202 });
  }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 }); }
}

function publicJob(j: any) {
  return {
    id: j.id,
    category: j.category,
    status: j.status,
    error: j.error,
    createdAt: j.createdAt,
    fileUrl: j.status === "succeeded" ? `/api/v1/video/${j.id}/file` : null
  };
}
