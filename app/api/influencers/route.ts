import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createInfluencer, listInfluencers } from "@/lib/influencers";
import { discoverByInstagramUsername, discoverFromUrl } from "@/lib/influencer-discovery";

export async function GET(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || undefined;
  return NextResponse.json({ influencers: listInfluencers(status) });
}

/**
 * Body: one of
 *   { mode: "instagram", username: "..." }                     — first-party Graph business_discovery
 *   { mode: "url", sourceUrl: "https://...", nicheHint?: "..." } — operator-supplied single page
 *   { mode: "manual", handle, platform, ... }                   — manual entry, no discovery call
 */
export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const mode = String(body?.mode || "manual");

    if (mode === "instagram") {
      const username = String(body?.username || "").trim();
      if (!username) return NextResponse.json({ error: "username is required" }, { status: 400 });
      const influencer = await discoverByInstagramUsername(username);
      return NextResponse.json({ influencer }, { status: 201 });
    }

    if (mode === "url") {
      const sourceUrl = String(body?.sourceUrl || "").trim();
      if (!sourceUrl) return NextResponse.json({ error: "sourceUrl is required" }, { status: 400 });
      const { candidates, saved } = await discoverFromUrl({ sourceUrl, nicheHint: body?.nicheHint ? String(body.nicheHint) : null });
      return NextResponse.json({ candidates, influencers: saved }, { status: 201 });
    }

    const handle = String(body?.handle || "").trim();
    const platform = String(body?.platform || "").trim();
    if (!handle || !platform) return NextResponse.json({ error: "handle and platform are required" }, { status: 400 });
    const influencer = createInfluencer({
      handle,
      platform,
      profileUrl: body?.profileUrl || null,
      followerCount: body?.followerCount != null ? Number(body.followerCount) : null,
      engagementRate: body?.engagementRate != null ? Number(body.engagementRate) : null,
      niche: body?.niche || null,
      contactEmail: body?.contactEmail || null,
      notes: body?.notes || "",
      source: "manual"
    });
    return NextResponse.json({ influencer }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
