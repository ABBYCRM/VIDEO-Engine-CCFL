import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { deletePersistentLibraryAsset } from "@/lib/persistent-library";

export const runtime = "nodejs";

/**
 * GET  /api/creator/posts — list every creator-upload post (creator-reel | creator-story | creator-post)
 *                              plus the persistent library asset that backs them.
 *
 * DELETE /api/creator/posts?ids=id1,id2 — remove the scheduled_posts rows AND the
 *                              backing library asset. Used when the operator clicks
 *                              "Delete" on a creator upload.
 *
 * Query params:
 *   ids: comma-separated list of scheduled_posts.id
 *   also: 1 (default) — also delete the backing library asset
 *   also: 0 — only delete the scheduled_posts rows (keep the video in the library)
 */
export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const rows = db.prepare(
      `SELECT id, title, network, scheduled_at, status, auto_post, caption,
              content_type, media_url, media_type, source_asset_key,
              category, created_at
       FROM scheduled_posts
       WHERE content_type IN ('creator-reel','creator-story','creator-post')
       ORDER BY scheduled_at DESC, created_at DESC
       LIMIT 500`
    ).all() as any[];
    return NextResponse.json({ posts: rows });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const url = new URL(req.url);
    const ids = (url.searchParams.get("ids") || "").split(",").map(s => s.trim()).filter(Boolean);
    if (ids.length === 0) return NextResponse.json({ error: "ids query param required" }, { status: 400 });
    const also = url.searchParams.get("also") !== "0";

    const placeholders = ids.map(() => "?").join(",");
    const rows = db.prepare(
      `SELECT id, source_asset_key, media_url, status FROM scheduled_posts
       WHERE id IN (${placeholders}) AND content_type IN ('creator-reel','creator-story','creator-post')`
    ).all(...ids) as Array<{ id: string; source_asset_key: string | null; media_url: string | null; status: string }>;

    // Refuse to delete anything that's already been published
    const published = rows.filter(r => r.status === "published");
    if (published.length) {
      return NextResponse.json({
        error: "Some posts are already published and cannot be deleted",
        publishedIds: published.map(r => r.id)
      }, { status: 409 });
    }

    // 1) Remove the scheduled_posts rows
    const del = db.prepare(
      `DELETE FROM scheduled_posts WHERE id IN (${placeholders}) AND content_type IN ('creator-reel','creator-story','creator-post')`
    ).run(...ids);

    // 2) If the operator asked for it, remove the backing library asset too.
    //    We use the source_asset_key (e.g. "creator:<uuid>") when present, else
    //    derive a key from the media_url filename.
    let removedAssets = 0;
    if (also) {
      const keys = new Set<string>();
      for (const r of rows) {
        if (r.source_asset_key) keys.add(r.source_asset_key);
        else if (r.media_url) {
          // Best effort: map the media_url to a key. Library uses "<kind>:<id>".
          const m = r.media_url.match(/\/api\/library\/assets\/([^/]+)\/file/);
          if (m) {
            try {
              const decoded = decodeURIComponent(m[1]);
              if (decoded.includes(":")) keys.add(decoded);
            } catch {}
          }
        }
      }
      for (const k of keys) {
        try { await deletePersistentLibraryAsset(k); removedAssets++; } catch {}
      }
    }

    return NextResponse.json({
      ok: true,
      deletedRows: del.changes,
      removedAssets,
      ids
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
