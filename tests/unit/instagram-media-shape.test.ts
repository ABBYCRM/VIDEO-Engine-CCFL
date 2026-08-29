import assert from "node:assert/strict";
import test from "node:test";
import { digArray, summarizeMedia } from "../../lib/claw/instagram-media-shape.ts";

const LONG_CAPTION = "🚨💦 Be careful on wet floors! Slippery surfaces can lead to unexpected falls. Our experienced team can help you navigate the process.\r\n\r\nVisit CaseClosedFL.com or call (561) 566-1360 for a free consultation, no pressure.\nGeneral information only—not legal advice.\n#Florida #SlipAndFall #CaseClosedFL";

test("digArray finds the array under Composio's triple-nested envelope", () => {
  // Matches the real shape observed live: our own {via,data} wrapper around
  // a Composio SDK envelope around Meta's own {data:[...],paging:{...}}.
  const composioShaped = { data: { data: { data: [{ id: "1", caption: LONG_CAPTION }] } } };
  const found = digArray(composioShaped.data);
  assert.ok(Array.isArray(found));
  assert.equal(found!.length, 1);
  assert.equal(found![0].id, "1");
});

test("digArray finds the array under Graph's flat {data:[...]} shape", () => {
  const graphShaped = { data: [{ id: "2", caption: LONG_CAPTION }] };
  const found = digArray(graphShaped);
  assert.equal(found!.length, 1);
  assert.equal(found![0].id, "2");
});

test("digArray returns null instead of looping forever on a cyclic-ish deep object", () => {
  let deep: any = { data: [] };
  for (let i = 0; i < 20; i++) deep = { data: deep };
  assert.equal(digArray(deep), null);
});

test("summarizeMedia keeps id first and caption short, surviving the real 6000-char clip at the real 25-item cap", () => {
  // Matches production exactly: summarizeMedia's own 25-item cap, and
  // lib/claw/tools.ts's clip(v, 6000) applied to whatever a tool returns.
  const items = Array.from({ length: 25 }, (_, i) => ({
    id: `18137251506${String(i).padStart(2, "0")}`,
    caption: LONG_CAPTION,
    media_type: "VIDEO",
    comments_count: 0,
    like_count: 12
  }));
  const summarized = summarizeMedia(items);
  const serialized = JSON.stringify(summarized);
  const clipped = serialized.length > 6000 ? serialized.slice(0, 6000) : serialized;
  assert.equal(clipped, serialized, "25 summarized items should fit under the real 6000-char clip with room to spare");
  for (const item of items) {
    assert.ok(clipped.includes(item.id), `id ${item.id} should survive the real clip`);
  }
  assert.ok(summarized[0].caption!.length <= 100, "captions are truncated, not left full-length");

  // The bug this guards against, reproduced at the real default limit (12,
  // lib/claw/tools.ts's ig_list_media default) with the real per-item field
  // richness Composio actually returns (caption, media_url, permalink,
  // thumbnail_url, owner/shortcode/username metadata) — not just caption:
  // a flat 6000-char clip on the *raw* shape runs out of budget partway
  // through the item list, well before the last few items' ids.
  const rawItems = Array.from({ length: 12 }, (_, i) => ({
    caption: LONG_CAPTION,
    comments_count: 0,
    media_id: `18137251506${String(i).padStart(2, "0")}`,
    media_type: "VIDEO",
    media_url: `https://scontent-iad6-1.cdninstagram.com/o1/v/t2/f2/m86/AQN-Zh3sOXz2eNi_DxYMk2-cvBo5LSkvGmnLydCs1h9mEfGqE6p2frpzia3xwW-q9nps-rqQ_xAKDY-fcktcELRCdJir-C75PFU1P_g${i}.mp4`,
    owner_id: "28856798053922087",
    permalink: `https://www.instagram.com/reel/DcmR7FLjW9s${i}/`,
    shortcode: `DcmR7FLjW9s${i}`,
    thumbnail_url: `https://scontent-iad3-1.cdninstagram.com/v/t51.71878-15/788230790_3153807111678323_8898300761069959175_n${i}.jpg`,
    timestamp: "2026-08-28T21:01:57+0000",
    id: `18137251506${String(i).padStart(2, "0")}`,
    username: "case_closed_fl"
  }));
  const rawClipped = JSON.stringify(rawItems).slice(0, 6000);
  assert.ok(!rawClipped.includes(rawItems[11].id), "sanity check: the real un-normalized shape at the real default limit really does bury later ids past the clip point");

  // The actual fix: summarizeMedia keeps every one of those 12 ids under
  // the same real clip.
  const fixed = JSON.stringify(summarizeMedia(rawItems)).slice(0, 6000);
  for (const item of rawItems) assert.ok(fixed.includes(item.id), `id ${item.id} survives after summarizeMedia`);
});

test("summarizeMedia tolerates missing fields without throwing", () => {
  const summarized = summarizeMedia([{}, null as any, { id: "ok" }]);
  assert.equal(summarized[0].id, null);
  assert.equal(summarized[1].id, null);
  assert.equal(summarized[2].id, "ok");
});
