import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createJob } from "@/lib/jobs";
import { isImageGenEnabled, imageGenDisabledResponse } from "@/lib/feature-flags";
import type { ProviderId } from "@/lib/providers";

function isProviderId(v: unknown): v is ProviderId {
  return v === "veo" || v === "grok" || v === "a2e" || v === "hedra";
}

type Brief = { mission: string; subject?: string; script?: string; avatarId?: string };

/**
 * POST /api/internal/ugc/batch
 * Body: { briefs: [{ mission, subject?, script?, avatarId? }, ...], provider?, model? }
 *
 * UGC Videos Agent batch mode: pure orchestration over the existing one-shot
 * job queue (lib/jobs.ts createJob) — enqueues one video_jobs row per brief,
 * sequentially, so this app's one-generation-request=one-provider-operation
 * contract (AGENTS.md) is preserved per brief rather than fanning out
 * concurrent provider calls.
 */
export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isImageGenEnabled()) return imageGenDisabledResponse();

  const body = await req.json().catch(() => ({}));
  const briefs: Brief[] = Array.isArray(body?.briefs) ? body.briefs : [];
  if (!briefs.length) return NextResponse.json({ error: "briefs[] is required" }, { status: 400 });
  if (briefs.length > 25) return NextResponse.json({ error: "A batch is limited to 25 briefs" }, { status: 400 });

  const provider = isProviderId(body?.provider) ? body.provider : undefined;
  const model = body?.model ? String(body.model) : undefined;

  const jobs: any[] = [];
  const failed: { index: number; error: string }[] = [];

  for (let i = 0; i < briefs.length; i++) {
    const brief = briefs[i];
    const mission = String(brief?.mission || "").trim();
    if (!mission) {
      failed.push({ index: i, error: "mission is required" });
      continue;
    }
    try {
      const job = await createJob({
        source: "admin",
        category: "ugc",
        mission,
        subject: brief.subject ? String(brief.subject) : undefined,
        script: brief.script ? String(brief.script) : undefined,
        provider,
        model,
        avatarId: brief.avatarId ? String(brief.avatarId) : undefined
      });
      jobs.push({ index: i, id: job.id, status: job.status });
    } catch (e) {
      failed.push({ index: i, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return NextResponse.json({ ok: true, queued: jobs.length, jobs, failed }, { status: 202 });
}
