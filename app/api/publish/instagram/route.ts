import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getComposio } from "@/lib/composio/client";
import { db } from "@/lib/db";
import { publicMediaUrl } from "@/lib/publish-media";

function pickId(value: any): string | null {
  return value?.data?.id || value?.data?.data?.id || value?.id || value?.creation_id || value?.data?.creation_id || null;
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const jobId = String(body.jobId || "").trim();
    const caption = String(body.caption || "").trim().slice(0, 2200);
    if (!jobId) return NextResponse.json({ error: "jobId is required" }, { status: 400 });

    const job = db.prepare("SELECT id,status FROM video_jobs WHERE id=?").get(jobId) as { id: string; status: string } | undefined;
    if (!job || job.status !== "succeeded") return NextResponse.json({ error: "Video must finish before publishing" }, { status: 409 });

    const composio: any = getComposio();
    const userId = "admin";
    const toolOptions = { dangerouslySkipVersionCheck: true };
    const info = await composio.tools.execute("INSTAGRAM_GET_USER_INFO", { userId, arguments: {} }, toolOptions);
    const igUserId = pickId(info);
    if (!igUserId) throw new Error("Could not resolve the connected Instagram Business/Creator account id. Reconnect Instagram in Integrations.");

    const videoUrl = publicMediaUrl(jobId);
    const created = await composio.tools.execute("INSTAGRAM_POST_IG_USER_MEDIA", {
      userId,
      arguments: {
        ig_user_id: igUserId,
        video_url: videoUrl,
        media_type: "REELS",
        caption
      }
    }, toolOptions);
    const creationId = pickId(created);
    if (!creationId) throw new Error("Instagram media container was created without a creation id");

    const published = await composio.tools.execute("INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH", {
      userId,
      arguments: { ig_user_id: igUserId, creation_id: creationId }
    }, toolOptions);
    const mediaId = pickId(published);
    return NextResponse.json({ ok: true, creationId, mediaId, result: published });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
