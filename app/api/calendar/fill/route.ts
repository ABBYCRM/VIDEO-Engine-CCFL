// /api/calendar/fill — auto-create scheduled posts for a campaign.
//
// Body:
//   { campaignId: string, days: 3|7|14|30, autoPost?: boolean, outputMix?: "video"|"still"|"auto" }
// Response:
//   { ok: true, created: number, posts: [{ id, title, scheduledAt, network, status, autoPost }] }
//
// Strategy:
//   - Read the campaign (mission, category, videoEngine, etc. from site_context JSON)
//   - For each day, alternate Video / Still (or per outputMix) and create a draft scheduled post
//   - Schedule evenly across the operator's typical active hours (10:00 / 13:00 / 17:00 ET-ish UTC)
//   - If autoPost=true, mark the post as 'pending' so the publishing scheduler picks it up
//   - If no connected account is configured, mark 'draft' (operator must approve before publish)

import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

type OutputMix = "video" | "still" | "auto";

const NETWORKS = ["instagram", "tiktok", "facebook"] as const;
const TIMESLOTS = ["10:00", "13:00", "17:00", "19:30"]; // local-time hours

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const campaignId = String(body.campaignId || "").trim();
  const days = Math.max(1, Math.min(60, Number(body.days) || 7));
  const autoPost = Boolean(body.autoPost);
  const outputMix: OutputMix = ["video", "still", "auto"].includes(body.outputMix) ? body.outputMix : "auto";

  if (!campaignId) return NextResponse.json({ error: "campaignId is required" }, { status: 400 });
  const campaign = db.prepare("SELECT * FROM campaigns WHERE id=?").get(campaignId) as Record<string, any> | undefined;
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  // Look up the operator's Instagram / Facebook / TikTok connected accounts (any of them).
  const accounts = db.prepare(
    "SELECT toolkit, connected_account_id, alias FROM connected_accounts WHERE user_id='admin' AND status='ACTIVE' AND toolkit IN ('instagram','facebook','tiktok','youtube') ORDER BY toolkit"
  ).all() as Array<{ toolkit: string; connected_account_id: string; alias: string | null }>;
  const accountFor = (network: string) => accounts.find(a => a.toolkit === network);

  // Pick a default network: prefer instagram, then tiktok, then facebook
  const defaultNetwork = accountFor("instagram") ? "instagram" : accountFor("tiktok") ? "tiktok" : accountFor("facebook") ? "facebook" : "instagram";

  // Pre-parse campaign site_context to get videoEngine/duration if stored
  let ext: { videoEngine?: string; duration?: number; calendarDays?: number; outputMix?: OutputMix } = {};
  if (campaign.site_context) { try { ext = JSON.parse(campaign.site_context); } catch {} }

  const insert = db.prepare(
    "INSERT INTO scheduled_posts(id,title,network,scheduled_at,status,auto_post,caption,connected_account_id) VALUES(?,?,?,?,?,?,?,?)"
  );

  // Total slots = 1 post per day for short calendars, up to 3/day for 14/30-day calendars
  const slotsPerDay = days >= 14 ? 3 : days >= 7 ? 2 : 1;
  const totalSlots = days * slotsPerDay;

  const created: Array<{ id: string; title: string; scheduledAt: string; network: string; status: string; autoPost: boolean }> = [];
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  // Start tomorrow at 10:00 (operator-friendly morning)
  start.setDate(start.getDate() + 1);

  const baseTitle = (kind: "Video" | "Still", network: string, day: number) => {
    const cat = (campaign.category || "campaign").replace(/_/g, " ");
    return `${campaign.name} · Day ${day + 1} ${kind} (${network})`;
  };

  for (let slot = 0; slot < totalSlots; slot++) {
    const dayIdx = Math.floor(slot / slotsPerDay);
    const slotIdx = slot % slotsPerDay;
    const time = TIMESLOTS[slotIdx % TIMESLOTS.length];
    const [hh, mm] = time.split(":").map(n => Number(n));
    const when = new Date(start);
    when.setDate(when.getDate() + dayIdx);
    when.setHours(hh, mm, 0, 0);
    const whenIso = when.toISOString();

    // Output type
    let kind: "Video" | "Still";
    if (outputMix === "video") kind = "Video";
    else if (outputMix === "still") kind = "Still";
    else kind = slot % 2 === 0 ? "Video" : "Still"; // auto-alternate

    // Network: rotate across connected accounts so the operator can reach all of them
    const available = accounts.length ? accounts.map(a => a.toolkit) : [...NETWORKS];
    const network = available[slot % available.length] || defaultNetwork;
    const acct = accountFor(network);

    // Status: pending if autoPost + we have a connected account, otherwise draft
    const status = autoPost && acct ? "pending" : "draft";
    const autoPostDb = autoPost ? 1 : 0;

    // Caption: include campaign + category so the operator has context
    const caption = `${campaign.mission.slice(0, 280)}\n\n#${(campaign.category || "campaign").replace(/_/g, "")}`;

    const id = crypto.randomUUID();
    insert.run(
      id,
      baseTitle(kind, network, dayIdx),
      network,
      whenIso,
      status,
      autoPostDb,
      caption,
      acct?.connected_account_id || null
    );
    created.push({ id, title: baseTitle(kind, network, dayIdx), scheduledAt: whenIso, network, status, autoPost: Boolean(autoPostDb) });
  }

  return NextResponse.json({
    ok: true,
    campaignId,
    days,
    slotsPerDay,
    totalSlots,
    outputMix,
    autoPost,
    created: created.length,
    posts: created,
    note: accounts.length
      ? `Created ${created.length} posts. ${autoPost ? "Auto-post on." : "Auto-post off — operator review needed."}`
      : "No connected accounts yet — all posts are 'draft' until you connect Instagram / Facebook / TikTok in /integrations."
  });
}
