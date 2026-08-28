import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getNvidiaModel } from "@/lib/nvidia/client";
import { writeStandalonePost } from "@/lib/nvidia/content-writer";
import type { PlatformKey } from "@/lib/nvidia/schemas";
import { generateCreatorCaption, type CreatorCaptionFormat } from "@/lib/creator-caption";

export const runtime = "nodejs";

const NON_INSTAGRAM_PLATFORMS = ["facebook", "youtube", "tiktok", "x", "linkedin", "reddit"] as const;
function isNonInstagramPlatform(v: unknown): v is PlatformKey {
  return typeof v === "string" && (NON_INSTAGRAM_PLATFORMS as readonly string[]).includes(v);
}

/**
 * POST /api/creator/caption
 * Body: { subject: string, category: string, format: "reel" | "story" | "post", topic?: string, platform?: string }
 *
 * Default (no platform, or platform="instagram") behavior calls
 * lib/creator-caption.ts's generateCreatorCaption() — the Case Closed FL
 * branded Instagram caption with the operator-locked closer/hashtag rules.
 * Same function backs Claw's creator_upload_video tool when the operator
 * doesn't supply a caption of their own.
 *
 * When `platform` is one of facebook/youtube/tiktok/x/linkedin/reddit, this
 * instead calls the generic AI Content Writer (lib/nvidia/content-writer.ts)
 * for that platform's tone/length norms — those platforms don't share
 * Instagram's locked Case Closed FL closer text.
 *
 * Returns: { caption, hashtags, cta }
 */
export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: any = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Body must be an object" }, { status: 400 });

  const subject = String(body.subject || "").trim().slice(0, 200);
  const category = String(body.category || "ugc").trim();
  const format = (["reel", "story", "post"].includes(String(body.format)) ? String(body.format) : "reel") as CreatorCaptionFormat;
  const topic = String(body.topic || "").trim().slice(0, 200);

  if (!subject) return NextResponse.json({ error: "subject is required" }, { status: 400 });

  if (isNonInstagramPlatform(body.platform)) {
    try {
      const tone = typeof body.tone === "string" ? body.tone.trim().slice(0, 200) : null;
      const copy = await writeStandalonePost({ topic: topic ? `${subject} (${topic})` : subject, platform: body.platform, tone });
      return NextResponse.json({
        caption: copy.title ? `${copy.title}\n\n${copy.primaryText}` : copy.primaryText,
        hashtags: copy.hashtags || [],
        cta: copy.cta || "",
        title: copy.title || null,
        model: getNvidiaModel(),
        source: "nvidia",
        platform: body.platform
      });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : String(e), platform: body.platform }, { status: 400 });
    }
  }

  const result = await generateCreatorCaption({ subject, category, format, topic });
  return NextResponse.json(result);
}
