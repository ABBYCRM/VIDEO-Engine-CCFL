import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

// Per-loop liveness readback. The other healthcheck endpoints under
// /api/health only report provider-level state; this one walks the
// scheduled_posts table to count slots in each generation state so an
// operator (or a cron poller) can spot a stuck pipeline at a glance
// without admin auth. Rows are exact counts; if the operator sees
// "pending > 0" but the campaign-autopilot loop is supposed to be
// running, the boot-time start was missed — see lib/db.ts.
export async function GET() {
  const rows = db.prepare(
    `SELECT
      SUM(CASE WHEN generation_status='pending' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN generation_status='pending_manual' THEN 1 ELSE 0 END) AS pending_manual,
      SUM(CASE WHEN generation_status='generating' THEN 1 ELSE 0 END) AS generating,
      SUM(CASE WHEN generation_status='ready' THEN 1 ELSE 0 END) AS ready,
      SUM(CASE WHEN generation_status='failed' THEN 1 ELSE 0 END) AS failed,
      COUNT(*) AS total,
      SUM(CASE WHEN video_job_id IS NOT NULL AND status NOT IN ('published','failed') THEN 1 ELSE 0 END) AS with_video_job,
      SUM(CASE WHEN lower_job_id IS NOT NULL AND status NOT IN ('published','failed') THEN 1 ELSE 0 END) AS with_split_job
     FROM scheduled_posts`
  ).get() as any;
  const runs = db.prepare(
    `SELECT 'reddit_research_runs' AS t, COUNT(*) AS n, MAX(created_at) AS last_at FROM reddit_research_runs
     UNION ALL
     SELECT 'site_autopilot_runs' AS t, COUNT(*) AS n, MAX(created_at) AS last_at FROM site_autopilot_runs
     UNION ALL
     SELECT 'background_generation_commits' AS t, COUNT(*) AS n, MAX(created_at) AS last_at FROM background_generation_commits
     UNION ALL
     SELECT 'video_jobs' AS t, COUNT(*) AS n, MAX(created_at) AS last_at FROM video_jobs
     UNION ALL
     SELECT 'aion_decision_contracts' AS t, COUNT(*) AS n, MAX(created_at) AS last_at FROM aion_decision_contracts`
  ).all() as { t: string; n: number; last_at: string | null }[];
  return NextResponse.json({
    ok: true,
    scheduledPosts: {
      pending: Number(rows?.pending || 0),
      pending_manual: Number(rows?.pending_manual || 0),
      generating: Number(rows?.generating || 0),
      ready: Number(rows?.ready || 0),
      failed: Number(rows?.failed || 0),
      total: Number(rows?.total || 0),
      with_video_job: Number(rows?.with_video_job || 0),
      with_split_job: Number(rows?.with_split_job || 0)
    },
    campaignAutopilot: {
      ticks: Number((globalThis as any).__campaignAutopilotTicks || 0),
      lastError: (globalThis as any).__campaignAutopilotLastError || null
    },
    runs
  });
}
