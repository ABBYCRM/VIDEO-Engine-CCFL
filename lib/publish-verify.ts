// lib/publish-verify.ts
// After a calendar item is marked published, confirm against Instagram
// (via Composio) that the Reel is actually live on the account, capture its
// permalink, and stamp verified_at. The calendar UI shows a green light only
// once verified_at is set.
import { db } from "@/lib/db";
import { getActiveConnectedAccountId, getComposio } from "@/lib/composio/client";
import "@/lib/calendar-assets";

const USER_ID = "admin";
let verifying = false;

async function fetchAccountMedia(): Promise<Array<{ id: string; permalink?: string }>> {
  const composio: any = getComposio();
  const connectedAccountId = getActiveConnectedAccountId("instagram") || undefined;
  const result = await composio.tools.execute("INSTAGRAM_GET_USER_MEDIA", {
    userId: USER_ID,
    connectedAccountId,
    arguments: { limit: 50 },
    dangerouslySkipVersionCheck: true
  });
  if (result && typeof result === "object" && (result as any).successful === false) {
    throw new Error(String((result as any).error || "INSTAGRAM_GET_USER_MEDIA failed"));
  }
  const data: any = (result as any)?.data;
  const items = data?.data || data?.items || (Array.isArray(data) ? data : []);
  return Array.isArray(items) ? items : [];
}

export async function verifyPublishedInstagramOnce() {
  if (verifying) return { verified: 0 };
  verifying = true;
  try {
    const rows = db.prepare("SELECT id,instagram_reel_id,instagram_story_id FROM scheduled_posts WHERE network='instagram' AND status='published' AND verified_at IS NULL AND instagram_reel_id IS NOT NULL ORDER BY published_at DESC LIMIT 20").all() as any[];
    if (!rows.length) return { verified: 0 };
    const media = await fetchAccountMedia();
    const byId = new Map(media.map((m) => [String(m.id), m]));
    let verified = 0;
    for (const row of rows) {
      const hit = byId.get(String(row.instagram_reel_id));
      if (hit) {
        db.prepare("UPDATE scheduled_posts SET verified_at=?,instagram_permalink=?,verification_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(new Date().toISOString(), hit.permalink || null, row.id);
        verified++;
      } else {
        db.prepare("UPDATE scheduled_posts SET verification_error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run("Reel not visible on the Instagram account yet", row.id);
      }
    }
    return { verified };
  } catch (e) {
    console.warn("[publish-verify]", e instanceof Error ? e.message : String(e));
    return { verified: 0 };
  } finally {
    verifying = false;
  }
}
