// Post-dedup backstop -- every `INSERT INTO scheduled_posts` in this codebase
// (save_post, creator_upload_video, the Reddit research pipeline, and the
// Site/IG autopilot pipeline) should call findRecentDuplicatePost() right
// before it inserts. This exists for the double-fire cases an in-memory
// concurrency lock inside a single pipeline function can't cover on its
// own: a double-click before a button's busy-state disables it, a client
// retrying a request that actually already succeeded server-side, two
// browser tabs open to the same admin page, or two app instances (once this
// deployment is more than one process) racing the same manual-trigger route.
//
// Deliberately NOT a permanent unique constraint on content: the same
// caption/network/content-type combination CAN legitimately repeat once a
// campaign category rotates back around (lib/public-copy.ts's caption pool
// is a fixed rotation, not one-per-day-forever, so two runs days apart can
// draw the exact same pre-approved caption on purpose). The dedup window is
// only wide enough to catch an accidental double-fire of the SAME trigger,
// never a deliberate later repost.

import { db } from "@/lib/db";
import { computePostHash, type PostHashInput } from "@/lib/post-dedup-hash";

export { computePostHash, type PostHashInput };

// `content_hash` was added after scheduled_posts' initial table shape -- same
// ALTER-TABLE-if-missing pattern used throughout this codebase (e.g.
// lib/reddit-research/store.ts's `query` column). A plain (non-unique)
// index backs the windowed lookup below; see the module comment above for
// why this is intentionally not a UNIQUE constraint.
try {
  const cols = db.prepare("PRAGMA table_info(scheduled_posts)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "content_hash")) db.exec("ALTER TABLE scheduled_posts ADD COLUMN content_hash TEXT");
} catch { /* ignore */ }
try {
  db.exec("CREATE INDEX IF NOT EXISTS idx_scheduled_posts_content_hash ON scheduled_posts(content_hash, created_at)");
} catch { /* ignore */ }

/** How long a just-inserted post "counts" as a possible accidental repeat of
 *  the same trigger. Long enough to cover a double-click, a slow client
 *  retry, or two racing processes; short enough to never block a
 *  deliberate later repost of the same rotating caption. */
export const DEDUP_WINDOW_MINUTES = 5;

/** Returns the id of an existing scheduled_posts row with the same content
 *  hash inserted within the dedup window, or null if there isn't one. Call
 *  this immediately before every scheduled_posts insert.
 *
 *  Compares via SQLite's own strftime('%s', ...), not a JS-computed ISO
 *  cutoff string, on purpose: scheduled_posts.created_at is usually
 *  populated by the column's own `DEFAULT CURRENT_TIMESTAMP` (SQLite's
 *  space-separated "YYYY-MM-DD HH:MM:SS", no "T"/"Z"), not by any caller
 *  explicitly inserting a JS `toISOString()` value. A naive string
 *  comparison between those two formats is not equivalent to a
 *  chronological one (space sorts before "T"), so it would silently miss
 *  every real duplicate. strftime() parses either format correctly and
 *  compares as actual epoch seconds. */
export function findRecentDuplicatePost(hash: string): string | null {
  const row = db.prepare(
    `SELECT id FROM scheduled_posts WHERE content_hash=? AND strftime('%s', created_at) >= strftime('%s', 'now', ?) ORDER BY created_at DESC LIMIT 1`
  ).get(hash, `-${DEDUP_WINDOW_MINUTES} minutes`) as { id: string } | undefined;
  return row?.id ?? null;
}
