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

// Extracted straight from lib/campaign-autopilot.ts's generateNext() so this
// test can't silently drift from the real query (a hand-retyped copy is
// exactly how the '%HTTP [45]%' bug below went untested in the first
// place -- a duplicated-by-hand WHERE clause that quietly diverged from
// what the app actually runs).
function extractGenerateNextWhereClause(): string {
  const src = readFileSync(join(repoRoot, "lib", "campaign-autopilot.ts"), "utf8");
  const start = src.indexOf("WHERE sp.media_url IS NULL");
  if (start === -1) throw new Error("could not locate generateNext's WHERE clause in lib/campaign-autopilot.ts");
  const end = src.indexOf("LIMIT 1", start);
  if (end === -1) throw new Error("could not locate the end of generateNext's WHERE clause");
  const raw = src.slice(start, end + "LIMIT 1".length);
  // The real code interpolates this bit as a JS template literal
  // (`${slotId?"AND sp.id=?":""}`); extracting raw source text can't
  // evaluate that, so substitute the "slotId given" branch directly --
  // every test here always filters to one exact row by id.
  const placeholder = '${slotId?"AND sp.id=?":""}';
  if (!raw.includes(placeholder)) throw new Error("generateNext's WHERE clause no longer contains the expected slotId placeholder -- update this extraction");
  return raw.replace(placeholder, "AND sp.id=?");
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

describe("campaign-autopilot failed-slot retry eligibility (generateNext's real WHERE clause)", () => {
  function insertFailedSlot(db: Database.Database, id: string, error: string) {
    const inHorizon = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    db.prepare(
      `INSERT INTO scheduled_posts(id, title, network, scheduled_at, status, auto_post, caption, content_type, generation_status, error)
       VALUES(?,?,?,?,?,?,?,?,?,?)`
    ).run(id, "ugc · Day 1 · Video", "instagram", inHorizon, "approved", 1, "", "ugc", "failed", error);
  }

  function isEligible(db: Database.Database, id: string): boolean {
    const whereClause = extractGenerateNextWhereClause();
    const horizon = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const row = db
      .prepare(`SELECT sp.id FROM scheduled_posts sp LEFT JOIN campaigns c ON c.id=sp.campaign_id ${whereClause}`)
      .get(horizon, id) as { id: string } | undefined;
    return row?.id === id;
  }

  it("picks up a failed slot whose error names an HTTP 4xx/5xx status without naming a provider", () => {
    // This is exactly the case '%HTTP [45]%' was meant to catch and never
    // did: SQLite's LIKE has no bracket character-class syntax (that's
    // GLOB-only), so '%HTTP [45]%' only matches the literal substring
    // "HTTP [45]" -- never real text like "HTTP 404". A generic transport
    // error with no provider name in it relied on this clause alone.
    const db = openTestDb();
    insertFailedSlot(db, "slot-404", "Request rejected: HTTP 404 Not Found");
    insertFailedSlot(db, "slot-500", "Upstream error: HTTP 500 Internal Server Error");
    assert.equal(isEligible(db, "slot-404"), true, "a bare HTTP 404 error must be retry-eligible");
    assert.equal(isEligible(db, "slot-500"), true, "a bare HTTP 500 error must be retry-eligible");
  });

  it("still picks up failed slots via the provider-name clauses (Hedra/Veo/Grok/A2E)", () => {
    const db = openTestDb();
    insertFailedSlot(db, "slot-veo", "Veo start HTTP 404: model not found");
    insertFailedSlot(db, "slot-hedra", "Hedra start HTTP 500: server error");
    insertFailedSlot(db, "slot-a2e", "A2E rejected task: insufficient coins");
    for (const id of ["slot-veo", "slot-hedra", "slot-a2e"]) {
      assert.equal(isEligible(db, id), true, `${id} must be retry-eligible`);
    }
  });

  it("picks up a failed slot whose error contains an apostrophe (isn't supported)", () => {
    const db = openTestDb();
    insertFailedSlot(db, "slot-apos", "Model isn't supported for this provider");
    assert.equal(isEligible(db, "slot-apos"), true);
  });

  it("does not pick up a failed slot with an unrelated error", () => {
    const db = openTestDb();
    insertFailedSlot(db, "slot-other", "Disk full");
    assert.equal(isEligible(db, "slot-other"), false);
  });
});
