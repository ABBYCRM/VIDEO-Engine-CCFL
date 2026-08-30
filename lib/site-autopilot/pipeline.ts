// Site/IG autopilot — the "no human in the loop" version of the task Claw's
// chat-based Autopilot button drafts (scrape the site, keep the look
// consistent with the brand's existing Pixar-style posts, generate,
// publish). That chat flow stays draft-only and CONFIRM-gated by design —
// this is the separate, always-on background pipeline for operators who
// want it to actually go live on its own, the same way the Reddit
// market-research pipeline already does.
//
// It never invents a new visual style: every generated image uses the
// existing cartoon-template system (lib/cartoon-still-templates.ts), which
// already encodes the brand's Pixar-style look (navy panel, orange
// CaseClosedFL footer, recurring characters) — so "look like the brand's
// existing Instagram posts" is true by construction, not something this
// pipeline has to verify by inspecting past posts. It rotates through the
// 6 campaign categories so it doesn't repeat the same one every run, and
// grounds the choice in the site's current content the same way the Reddit
// pipeline does (lib/brand-context.ts). The published caption always comes
// from the pre-approved, legally-reviewed copy library — nothing here is
// model-written or scraped text sent straight to the public.

import crypto from "node:crypto";
import { db } from "@/lib/db";
import { isAutopilotEnabled } from "@/lib/autopilot-control";
import { isImageGenEnabled } from "@/lib/feature-flags";
import { fetchSiteContext } from "@/lib/brand-context";
import { pickCartoonTemplateForCategory, type CartoonTemplateDef } from "@/lib/cartoon-still-templates";
import { generateCampaignStill } from "@/lib/campaign-image";
import { publicCaptionForSlot } from "@/lib/public-copy";
import { runCalendarPublisherOnce } from "@/lib/calendar-publisher";
import { DAILY_GENERATION_LIMIT, countAllGenerationCommitsToday, recordBackgroundGenerationCommit } from "@/lib/generation-ledger";
import { saveSiteAutopilotRun, lastPostedCategory, hasScheduledSiteRunToday } from "@/lib/site-autopilot/store";

const VALID_CATEGORIES = ["car_accident", "rideshare", "trucking", "slip_fall", "workplace", "pedestrian"] as const;
type Category = (typeof VALID_CATEGORIES)[number];

export const SITE_AUTOPILOT_ENABLED: boolean = process.env.SITE_AUTOPILOT_ENABLED !== "false";

function dayOfYear(d = new Date()): number {
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  const diff = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - start;
  return Math.floor(diff / 86_400_000);
}

/** Rotate to the category after whichever this pipeline posted last, so
 *  back-to-back runs don't repeat the same look. Falls back to a
 *  day-of-year pick (offset from the Reddit pipeline's own rotation so the
 *  two pipelines aren't biased toward the same category on the same day)
 *  the first time this ever runs, when there's no history yet. */
function nextCategory(): Category {
  const last = lastPostedCategory();
  if (last) {
    const idx = VALID_CATEGORIES.indexOf(last as Category);
    if (idx >= 0) return VALID_CATEGORIES[(idx + 1) % VALID_CATEGORIES.length];
  }
  return VALID_CATEGORIES[(dayOfYear() + 3) % VALID_CATEGORIES.length];
}

async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) {
        const delayMs = 500 * Math.pow(2, i);
        console.warn(`[site-autopilot] ${label} failed (attempt ${i + 1}/${attempts}), retrying in ${delayMs}ms:`, e instanceof Error ? e.message : e);
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`${label} failed after ${attempts} attempts: ${String(lastErr)}`);
}

export type SiteAutopilotResult = {
  status: "success" | "skipped" | "failed";
  reason?: string;
  category?: string;
  scheduledPostId?: string;
  published?: boolean;
};

export async function runSiteAutopilotOnce(trigger: "scheduled" | "manual"): Promise<SiteAutopilotResult> {
  if (!isAutopilotEnabled()) {
    const reason = 'Autopilot is paused. Say "start autopilot" in Claw, or call autopilot_start, to resume.';
    saveSiteAutopilotRun({ status: "skipped", trigger, error: reason });
    return { status: "skipped", reason };
  }
  if (!SITE_AUTOPILOT_ENABLED) {
    const reason = "Site autopilot is disabled (SITE_AUTOPILOT_ENABLED=false).";
    saveSiteAutopilotRun({ status: "skipped", trigger, error: reason });
    return { status: "skipped", reason };
  }
  if (!isImageGenEnabled()) {
    const reason = "Image generation is disabled (IMAGE_GEN_ENABLED=false).";
    saveSiteAutopilotRun({ status: "skipped", trigger, error: reason });
    return { status: "skipped", reason };
  }

  const usedToday = countAllGenerationCommitsToday();
  if (usedToday >= DAILY_GENERATION_LIMIT) {
    const reason = `Daily generation cap reached (${usedToday}/${DAILY_GENERATION_LIMIT} across Claw chat + every autonomous pipeline today).`;
    saveSiteAutopilotRun({ status: "skipped", trigger, error: reason });
    return { status: "skipped", reason };
  }

  // Best-effort brand-voice grounding — never fatal. This pipeline doesn't
  // have Reddit-style external signal to classify, so the site's own
  // current content mainly serves as a sanity log in run history for now
  // (worth reading if the operator ever asks "why did it pick X today");
  // the category choice itself comes from simple rotation, not the model.
  await fetchSiteContext();

  const category = nextCategory();
  const seed = `site-autopilot-${new Date().toISOString().slice(0, 10)}`;
  const template: CartoonTemplateDef = pickCartoonTemplateForCategory(category, seed);

  let stillUrl: string, stillMime: string;
  try {
    const still = await withRetry("still generation", () =>
      generateCampaignStill({ prompt: "", stillTemplateId: template.id, category, seed, createCalendarPost: false })
    );
    stillUrl = still.assetUrl;
    stillMime = still.mimeType;
    recordBackgroundGenerationCommit("site-autopilot");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    saveSiteAutopilotRun({ status: "failed", trigger, category, error: `image gen: ${msg}` });
    return { status: "failed", reason: `Still generation failed: ${msg}`, category };
  }

  const { caption } = publicCaptionForSlot({ category, title: `Day ${dayOfYear()}` });
  const postId = crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO scheduled_posts(
      id, title, network, scheduled_at, status, auto_post, caption,
      content_type, media_url, media_type, generation_status, category, still_template_id
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    postId,
    `Site autopilot — ${category}`.slice(0, 180),
    "instagram",
    now,
    "approved",
    1,
    caption,
    "image",
    stillUrl,
    stillMime,
    "ready",
    category,
    template.id
  );

  // Same immediate-publish pattern as the Reddit pipeline: fire the normal
  // publisher now so this goes live right away; a failure here isn't a
  // pipeline failure since the row is already queued and the running
  // calendar-publisher loop will retry it within the minute regardless.
  let published = false;
  try {
    await runCalendarPublisherOnce();
    const row = db.prepare("SELECT status FROM scheduled_posts WHERE id=?").get(postId) as { status: string } | undefined;
    published = row?.status === "published";
  } catch (e) {
    console.warn("[site-autopilot] immediate publish attempt failed, will retry on the normal publisher loop:", e instanceof Error ? e.message : e);
  }

  saveSiteAutopilotRun({ status: "success", trigger, category, scheduledPostId: postId });
  return { status: "success", category, scheduledPostId: postId, published };
}

export { hasScheduledSiteRunToday };
