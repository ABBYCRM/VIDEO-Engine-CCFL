// After a calendar item is marked published, confirm against Instagram
// (official Graph API / instagram-mcp) that the Reel is live, capture its
// permalink, and stamp verified_at. The calendar UI shows a green light only
// once verified_at is set.
import { db } from "@/lib/db";
import { getMediaPermalink, isInstagramConfigured, listRecentMedia } from "@/lib/instagram-graph";
import "@/lib/calendar-assets";

let verifying = false;

export async function verifyPublishedInstagramOnce() {
  if (verifying) return { verified: 0 };
  if (!isInstagramConfigured()) return { verified: 0 };
  verifying = true;
  try {
    const rows = db.prepare("SELECT id,instagram_reel_id,instagram_story_id FROM scheduled_posts WHERE network='instagram' AND status='published' AND verified_at IS NULL AND instagram_reel_id IS NOT NULL ORDER BY published_at DESC LIMIT 20").all() as any[];
    if (!rows.length) return { verified: 0 };
    const media = await listRecentMedia(50);
    const byId = new Map(media.map((m) => [String(m.id), m]));
    let verified = 0;
    for (const row of rows) {
      let hit = byId.get(String(row.instagram_reel_id));
      let permalink = hit?.permalink || null;
      if (!hit) {
        try {
          const direct = await getMediaPermalink(String(row.instagram_reel_id));
          if (direct.id) {
            hit = { id: direct.id, permalink: direct.permalink || undefined };
            permalink = direct.permalink;
          }
        } catch {}
      }
      if (hit) {
        db.prepare("UPDATE scheduled_posts SET verified_at=?,instagram_permalink=?,verification_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(new Date().toISOString(), permalink, row.id);
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
