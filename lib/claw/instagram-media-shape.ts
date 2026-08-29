// Pure, dependency-free normalization for Instagram media-list results.
// Extracted out of lib/claw/tools.ts so it can be unit-tested under plain
// `node --test` (that file's other imports pull in DB/crypto modules that
// don't resolve there).
//
// Graph and Composio wrap a media list very differently (Graph: {data:[...]},
// Composio: {data:{data:[...],paging:{...}}} nested inside our own {via,data}
// envelope), and both put a long "caption" ahead of "id" in each item. A
// live bug traced to exactly this: a flat character-count clip() on the
// raw JSON landed inside the captions of the first couple of items, so the
// model never actually saw a real media id and fabricated one
// ("media_id_from_ig_list_media") instead of admitting it didn't have one.
// Digging out the array and keeping only the fields a follow-up call needs
// (id first, caption short) means every item's id survives clipping
// regardless of list length or caption length.

export function digArray(value: unknown, depth = 0): any[] | null {
  if (depth > 6 || value == null) return null;
  if (Array.isArray(value)) return value;
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (Array.isArray(obj.data)) return obj.data;
    if (obj.data && typeof obj.data === "object") return digArray(obj.data, depth + 1);
  }
  return null;
}

export function summarizeMedia(items: any[]) {
  return items.slice(0, 25).map((m) => ({
    id: m?.id ?? m?.ig_media_id ?? null,
    caption: typeof m?.caption === "string" ? m.caption.slice(0, 100) : null,
    mediaType: m?.media_type ?? m?.media_product_type ?? null,
    timestamp: m?.timestamp ?? null,
    commentsCount: m?.comments_count ?? null,
    likeCount: m?.like_count ?? null,
    permalink: m?.permalink ?? null
  }));
}
