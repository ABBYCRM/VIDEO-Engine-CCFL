import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { createStrategy, listStrategies } from "@/lib/strategies";
import { planStrategy } from "@/lib/nvidia/strategy-planner";
import { getSite } from "@/lib/sites";
import { isInstagramConfigured } from "@/lib/instagram-graph";
import { isYouTubeConnected } from "@/lib/youtube";

function liveChannels(): string[] {
  const channels: string[] = [];
  if (isInstagramConfigured()) channels.push("instagram");
  if (isYouTubeConnected()) channels.push("youtube");
  const rows = db.prepare("SELECT DISTINCT toolkit FROM connected_accounts WHERE UPPER(status)='ACTIVE'").all() as { toolkit: string }[];
  for (const r of rows) if (!channels.includes(r.toolkit)) channels.push(r.toolkit);
  return channels;
}

export async function GET(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const siteId = searchParams.get("siteId") || undefined;
  return NextResponse.json({ strategies: listStrategies(siteId) });
}

/** Body: { siteId?, title, horizon: "weekly"|"monthly"|"quarterly", recentPerformanceSummary? }
 *  Generates an AI strategy plan and saves it as a draft. */
export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const title = String(body?.title || "").trim();
    if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });
    const horizon = ["weekly", "monthly", "quarterly"].includes(body?.horizon) ? body.horizon : "monthly";
    const siteId = body?.siteId ? String(body.siteId) : null;
    const site = siteId ? getSite(siteId) : null;
    if (siteId && !site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

    const siteContext = site
      ? `${site.name} (${site.url}). Audience: ${site.targetAudience || "unspecified"}. Brand voice: ${site.brandVoice || "unspecified"}. Topic focus: ${site.topicFocus || "unspecified"}. Keywords: ${site.keywords || "unspecified"}.`
      : null;

    const plan = await planStrategy({
      title,
      horizon,
      siteContext,
      auditSummary: body?.auditSummary ? String(body.auditSummary).slice(0, 4000) : null,
      liveChannels: liveChannels(),
      recentPerformanceSummary: body?.recentPerformanceSummary ? String(body.recentPerformanceSummary).slice(0, 2000) : null
    });

    const strategy = createStrategy({
      siteId,
      title,
      horizon,
      goals: plan.goals,
      channelMix: plan.channelMix,
      contentPillars: plan.contentPillars,
      rationale: plan.rationale,
      model: "nvidia"
    });
    return NextResponse.json({ strategy }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
