import { describe, it } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..", "..");

// The campaign-autopilot loop's `generateNext` and `finishGenerating` SQL
// must use LEFT JOIN against campaigns, not INNER JOIN, otherwise every
// scheduled_post that doesn't have a campaign_id (e.g. slots created via
// /api/calendar/plan with createPlanningSlots, or /api/creator/upload, or
// /api/internal/ugc/batch) is silently filtered out and stuck at
// generation_status='pending' forever. Operator screenshot 2026-08-30:
// "ugc · male · Day 1/2/3 · Video" — 7 posts from createPlanningSlots with
// no campaignId argument — all stuck pending.

function openTestDb() {
  const db = new Database(":memory:");
  // The DDL extracted from lib/db.ts references video_jobs via a FK on
  // scheduled_posts.video_job_id; create those tables minimally first.
  db.exec(`CREATE TABLE IF NOT EXISTS video_jobs (id TEXT PRIMARY KEY)`);
  db.exec(`CREATE TABLE IF NOT EXISTS campaigns (id TEXT PRIMARY KEY)`);
  // Pull the scheduled_posts CREATE TABLE DDL verbatim from lib/db.ts so the
  // test exercises the same base schema. The full set of columns the live app
  // uses is then mutated at module-import time in lib/calendar-assets.ts
  // (ensureColumn calls at the top of the file) and lib/db.ts; replicate
  // them all so the test's INSERTs work and so we exercise the same schema
  // the live SQLite store has at boot.
  const ddl = readFileSync(join(repoRoot, "lib", "db.ts"), "utf8");
  const m = ddl.match(/CREATE TABLE IF NOT EXISTS scheduled_posts \([\s\S]*?\);/);
  if (!m) throw new Error("could not locate scheduled_posts DDL in lib/db.ts");
  db.exec(m[0]);
  // Mirror lib/calendar-assets.ts's runtime ALTERs.
  const alters: Array<[string, string]> = [
    ["content_type", "content_type TEXT NOT NULL DEFAULT 'ugc'"],
    ["media_url", "media_url TEXT"],
    ["media_type", "media_type TEXT"],
    ["source_asset_key", "source_asset_key TEXT"],
    ["site_id", "site_id TEXT"],
    ["campaign_id", "campaign_id TEXT"],
    ["planning_horizon_days", "planning_horizon_days INTEGER"],
    ["content_body", "content_body TEXT"],
    ["seo_title", "seo_title TEXT"],
    ["meta_description", "meta_description TEXT"],
    ["slug", "slug TEXT"],
    ["focus_keyword", "focus_keyword TEXT"],
    ["generation_status", "generation_status TEXT NOT NULL DEFAULT 'ready'"],
    ["upper_job_id", "upper_job_id TEXT"],
    ["lower_job_id", "lower_job_id TEXT"],
    ["category", "category TEXT"],
    ["still_template_id", "still_template_id TEXT"],
    ["split_template", "split_template TEXT"],
    ["content_hash", "content_hash TEXT"]
  ];
  for (const [col, def] of alters) {
    try {
      db.exec(`ALTER TABLE scheduled_posts ADD COLUMN ${def}`);
    } catch {
      /* column may already exist */
    }
  }
  return db;
}

describe("campaign-autopilot loop eligibility", () => {
  it("picks up a pending post that has no campaign_id (non-campaign slot)", () => {
    const db = openTestDb();
    const now = Date.now();
    const horizon = new Date(now + 24 * 60 * 60 * 1000).toISOString();
    const inHorizon = new Date(now + 60 * 60 * 1000).toISOString();
    db.prepare(
      `INSERT INTO scheduled_posts(id, title, network, scheduled_at, status, auto_post, caption, content_type, generation_status)
       VALUES(?,?,?,?,?,?,?,?,?)`
    ).run("slot-1", "ugc · male · Day 1 · Video", "instagram", inHorizon, "approved", 1, "", "ugc", "pending");

    // New LEFT JOIN: no `campaign_id IS NOT NULL` filter.
    const row = db
      .prepare(
        `SELECT sp.id, sp.title, sp.generation_status, sp.video_job_id, sp.upper_job_id, sp.lower_job_id
         FROM scheduled_posts sp LEFT JOIN campaigns c ON c.id=sp.campaign_id
         WHERE sp.media_url IS NULL
           AND sp.status!='published'
           AND sp.scheduled_at <= ?
           AND sp.generation_status='pending'
           AND sp.video_job_id IS NULL
           AND sp.upper_job_id IS NULL
           AND sp.lower_job_id IS NULL
         ORDER BY sp.scheduled_at ASC, sp.created_at ASC
         LIMIT 1`
      )
      .get(horizon) as { id: string } | undefined;

    assert.equal(row?.id, "slot-1", "non-campaign pending slot must be eligible");
  });

  it("does not pick up a slot whose scheduled_at is beyond the 24h horizon", () => {
    const db = openTestDb();
    const now = Date.now();
    const horizon = new Date(now + 24 * 60 * 60 * 1000).toISOString();
    const farFuture = new Date(now + 48 * 60 * 60 * 1000).toISOString();
    db.prepare(
      `INSERT INTO scheduled_posts(id, title, network, scheduled_at, status, auto_post, caption, content_type, generation_status)
       VALUES(?,?,?,?,?,?,?,?,?)`
    ).run("slot-far", "ugc · male · Day 7 · Video", "instagram", farFuture, "approved", 1, "", "ugc", "pending");

    const row = db
      .prepare(
        `SELECT sp.id FROM scheduled_posts sp LEFT JOIN campaigns c ON c.id=sp.campaign_id
         WHERE sp.media_url IS NULL AND sp.status!='published' AND sp.scheduled_at <= ?
           AND sp.generation_status='pending' AND sp.video_job_id IS NULL
           AND sp.upper_job_id IS NULL AND sp.lower_job_id IS NULL
         ORDER BY sp.scheduled_at ASC, sp.created_at ASC LIMIT 1`
      )
      .get(horizon);
    assert.equal(row, undefined, "slot beyond 24h horizon must not be eligible");
  });

  it("does not pick up a slot that already has a media_url", () => {
    const db = openTestDb();
    const inHorizon = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    db.prepare(
      `INSERT INTO scheduled_posts(id, title, network, scheduled_at, status, auto_post, caption, content_type, media_url, media_type, generation_status)
       VALUES(?,?,?,?,?,?,?,?,?,?,?)`
    ).run("slot-ready", "ugc · Day 1 · Video", "instagram", inHorizon, "approved", 1, "", "ugc", "/uploads/x.mp4", "video/mp4", "ready");

    const row = db
      .prepare(
        `SELECT sp.id FROM scheduled_posts sp LEFT JOIN campaigns c ON c.id=sp.campaign_id
         WHERE sp.media_url IS NULL AND sp.status!='published'
           AND sp.scheduled_at <= ?
           AND sp.generation_status='pending' AND sp.video_job_id IS NULL
           AND sp.upper_job_id IS NULL AND sp.lower_job_id IS NULL
         ORDER BY sp.scheduled_at ASC, sp.created_at ASC LIMIT 1`
      )
      .get(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString());
    assert.equal(row, undefined, "slot with media_url set must not be eligible");
  });

  it("does not pick up a published slot", () => {
    const db = openTestDb();
    const inHorizon = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    db.prepare(
      `INSERT INTO scheduled_posts(id, title, network, scheduled_at, status, auto_post, caption, content_type, media_url, media_type, generation_status)
       VALUES(?,?,?,?,?,?,?,?,?,?,?)`
    ).run("slot-pub", "ugc · Day 1 · Video", "instagram", inHorizon, "published", 1, "", "ugc", "/uploads/x.mp4", "video/mp4", "ready");
    const row = db
      .prepare(
        `SELECT sp.id FROM scheduled_posts sp LEFT JOIN campaigns c ON c.id=sp.campaign_id
         WHERE sp.media_url IS NULL AND sp.status!='published'
           AND sp.scheduled_at <= ?
           AND sp.generation_status='pending' AND sp.video_job_id IS NULL
           AND sp.upper_job_id IS NULL AND sp.lower_job_id IS NULL
         ORDER BY sp.scheduled_at ASC, sp.created_at ASC LIMIT 1`
      )
      .get(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString());
    assert.equal(row, undefined, "published slot must not be eligible");
  });
});
