import { NextResponse } from "next/server";
import { verifyApiToken } from "@/lib/tokens";
import { createJob } from "@/lib/jobs";
import { parseGenerationBody } from "@/lib/request";
import { isImageGenEnabled } from "@/lib/feature-flags";
function token(req: Request) { const h = req.headers.get("authorization") || ""; return h.startsWith("Bearer ") ? h.slice(7) : ""; }
export async function POST(req: Request) {
  if (!verifyApiToken(token(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isImageGenEnabled()) {
    return NextResponse.json({
      error: "Image + video generation is disabled. Set IMAGE_GEN_ENABLED=true to re-enable.",
      feature: "image_generation",
      disabled: true
    }, { status: 410 });
  }
  try { const input = parseGenerationBody(await req.json()); const job = await createJob({ ...input, source: "api" }); return NextResponse.json({ id: job.id, status: job.status, statusUrl: `/api/v1/video/${job.id}`, durationSeconds: 8, oneShot: true }, { status: 202 }); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 }); }
}
