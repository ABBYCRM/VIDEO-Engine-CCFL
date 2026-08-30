// Reddit market-research sub-agent.
//
// This is NOT a Reddit chat bot: it never posts, comments, or replies on
// Reddit. It is a read-only analysis pipeline that (1) discovers PI-relevant
// public Reddit discussion, (2) anonymizes it (lib/reddit-research/anonymize.ts
// — usernames/handles/links/contact info are stripped before anything reaches
// a model, structurally as well as textually), (3) asks NVIDIA to classify
// the dominant AGGREGATE theme into one campaign category (never to quote or
// summarize any specific post), then (4) generates one on-brand Pixar-style
// still from the existing cartoon template system and a pre-approved,
// legally-reviewed caption from lib/public-copy.ts — the model never writes
// the published caption text itself. The result is queued through the exact
// same scheduled_posts + calendar-publisher pipeline every other campaign
// post already uses (auto_post=1), then an immediate publish pass is
// triggered so a scheduled/manual run goes live right away instead of
// waiting for the next 60s tick.
//
// Every external call (Composio search, Composio comments, NVIDIA
// synthesis, image generation) is wrapped in withRetry() — third-party APIs
// are flaky, and a scheduled overnight run has no one watching it to retry
// by hand. Any stage that exhausts its retries fails the run cleanly (saved
// to reddit_research_runs as 'failed') rather than throwing into the
// scheduler or fabricating content from partial data.

import crypto from "node:crypto";
import { composioSearchPosts, composioListComments, isRedditComposioConnected } from "@/lib/reddit-composio";
import { anonymizePost, anonymizeComment, type AnonymizedPost } from "@/lib/reddit-research/anonymize";
import { saveRedditResearchRun, hasScheduledRunToday } from "@/lib/reddit-research/store";
import { chatCompletion } from "@/lib/nvidia/client";
import { isNvidiaEnabled } from "@/lib/nvidia/client";
import { pickCartoonTemplateForCategory } from "@/lib/cartoon-still-templates";
import { generateCampaignStill } from "@/lib/campaign-image";
import { publicCaptionForSlot } from "@/lib/public-copy";
import { db } from "@/lib/db";
import { runCalendarPublisherOnce } from "@/lib/calendar-publisher";

const VALID_CATEGORIES = ["car_accident", "rideshare", "trucking", "slip_fall", "workplace", "pedestrian"] as const;
type Category = (typeof VALID_CATEGORIES)[number];

// Rotates by day-of-year so a scheduled run doesn't hammer the same search
// every night. Kept deliberately generic ("after a crash", "hurt at work")
// rather than incident-specific, since the goal is discovering whatever
// discussion is actually happening, not confirming a pre-picked narrative.
const DISCOVERY_QUERIES = [
  "car accident who is at fault",
  "hurt at work injury claim",
  "slip and fall injury store",
  "rideshare accident uber lyft injured",
  "truck accident highway injured",
  "hit by car crossing street",
  "car accident insurance won't pay",
  "injured on the job workers comp help"
];

function dayOfYear(d = new Date()): number {
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  const diff = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - start;
  return Math.floor(diff / 86_400_000);
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
        console.warn(`[reddit-research] ${label} failed (attempt ${i + 1}/${attempts}), retrying in ${delayMs}ms:`, e instanceof Error ? e.message : e);
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`${label} failed after ${attempts} attempts: ${String(lastErr)}`);
}

/** Defensive parsing: Composio's Reddit listing shape hasn't been exercised
 *  against a live key in this environment. Try the shapes a Reddit-API-backed
 *  tool is most likely to return; if none match, return an empty list rather
 *  than guessing at a structure and passing garbage downstream. */
function extractPosts(result: unknown): Record<string, unknown>[] {
  const data = (result as any)?.data ?? result;
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (Array.isArray(data?.posts)) return data.posts;
  if (Array.isArray(data?.children)) return data.children.map((c: any) => c?.data ?? c);
  if (Array.isArray(data?.data?.children)) return data.data.children.map((c: any) => c?.data ?? c);
  return [];
}

function extractComments(result: unknown): Record<string, unknown>[] {
  const data = (result as any)?.data ?? result;
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (Array.isArray(data?.comments)) return data.comments;
  const listing = Array.isArray(data) ? data[1] : data?.[1];
  if (Array.isArray(listing?.data?.children)) return listing.data.children.map((c: any) => c?.data ?? c);
  if (Array.isArray(data?.data?.children)) return data.data.children.map((c: any) => c?.data ?? c);
  return [];
}

type SynthesisResult = { category: Category; themeSummary: string; confidence: number };

async function synthesizeTheme(posts: AnonymizedPost[], comments: string[]): Promise<SynthesisResult> {
  const postsBlock = posts
    .map((p, i) => `Post ${i + 1} [r/${p.subreddit}, score ${p.score}]: ${p.title}\n${p.body}`.trim())
    .join("\n\n");
  const commentsBlock = comments.map((c, i) => `Comment ${i + 1}: ${c}`).join("\n");

  const system = `You analyze anonymized, aggregated public Reddit discussion for a Florida personal-injury law firm's marketing team. You never quote or closely paraphrase any single post or comment, and you never mention or infer any username, handle, or identifying detail — everything you output must describe a PATTERN across multiple posts, never one story. Respond with strict JSON only: {"category": one of ${JSON.stringify(VALID_CATEGORIES)}, "themeSummary": "<one internal sentence describing the aggregate theme, for an internal team log only, never published verbatim>", "confidence": <0 to 1>}. Pick the category that best matches the DOMINANT topic across the posts below. If the material doesn't clearly fit any category, still pick the closest one and lower confidence.`;
  const user = `POSTS:\n${postsBlock || "(none)"}\n\nCOMMENTS:\n${commentsBlock || "(none)"}`;

  const res = await withRetry("nvidia synthesis", () =>
    chatCompletion({
      model: "nvidia/llama-3.1-nemotron-ultra-253b-v1",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
      jsonMode: true,
      temperature: 0.4,
      maxTokens: 400
    })
  );

  let parsed: any;
  try {
    parsed = JSON.parse(res.text);
  } catch {
    throw new Error("NVIDIA synthesis did not return valid JSON");
  }
  const category: Category = VALID_CATEGORIES.includes(parsed.category) ? parsed.category : "car_accident";
  const themeSummary = String(parsed.themeSummary || "Aggregate PI-related discussion detected.").slice(0, 500);
  const confidence = Number(parsed.confidence);
  return { category, themeSummary, confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.5 };
}

export type RedditResearchResult = {
  status: "success" | "skipped" | "failed";
  reason?: string;
  postsScanned: number;
  commentsScanned: number;
  category?: string;
  themeSummary?: string;
  scheduledPostId?: string;
  published?: boolean;
};

export async function runRedditMarketResearchOnce(trigger: "scheduled" | "manual"): Promise<RedditResearchResult> {
  if (!isRedditComposioConnected()) {
    const r: RedditResearchResult = { status: "skipped", reason: "Reddit is not connected in Integrations.", postsScanned: 0, commentsScanned: 0 };
    saveRedditResearchRun({ status: "skipped", trigger, postsScanned: 0, commentsScanned: 0, error: r.reason });
    return r;
  }
  if (!isNvidiaEnabled()) {
    const r: RedditResearchResult = { status: "skipped", reason: "NVIDIA is not configured in Settings.", postsScanned: 0, commentsScanned: 0 };
    saveRedditResearchRun({ status: "skipped", trigger, postsScanned: 0, commentsScanned: 0, error: r.reason });
    return r;
  }

  const query = DISCOVERY_QUERIES[dayOfYear() % DISCOVERY_QUERIES.length];
  let rawPosts: Record<string, unknown>[];
  try {
    const searchResult = await withRetry("Reddit post search", () => composioSearchPosts(query, 15));
    rawPosts = extractPosts(searchResult);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    saveRedditResearchRun({ status: "failed", trigger, postsScanned: 0, commentsScanned: 0, error: `discovery: ${msg}` });
    return { status: "failed", reason: `Reddit search failed: ${msg}`, postsScanned: 0, commentsScanned: 0 };
  }

  if (rawPosts.length === 0) {
    saveRedditResearchRun({ status: "skipped", trigger, postsScanned: 0, commentsScanned: 0, error: "No candidate posts returned for today's query." });
    return { status: "skipped", reason: "No candidate Reddit posts found today.", postsScanned: 0, commentsScanned: 0 };
  }

  // Cap: read at most 5 candidate posts, and comments on at most 3 of them —
  // bounded per-run cost regardless of how much the search returns.
  const candidates = rawPosts
    .slice()
    .sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0))
    .slice(0, 5)
    .map(anonymizePost);

  const commentTexts: string[] = [];
  let commentsScanned = 0;
  for (const raw of rawPosts.slice(0, 3)) {
    const id = String(raw.id || raw.name || "").replace(/^t3_/, "");
    if (!id) continue;
    try {
      const commentsResult = await withRetry(`comments for ${id}`, () => composioListComments(id));
      const anonymized = extractComments(commentsResult).slice(0, 8).map(anonymizeComment);
      for (const c of anonymized) {
        if (c.body) commentTexts.push(c.body);
      }
      commentsScanned += anonymized.length;
    } catch (e) {
      // A single post's comments failing isn't fatal to the run — proceed
      // with whatever posts/comments were successfully gathered.
      console.warn(`[reddit-research] comments fetch failed for a candidate post:`, e instanceof Error ? e.message : e);
    }
  }

  let synthesis: SynthesisResult;
  try {
    synthesis = await synthesizeTheme(candidates, commentTexts);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    saveRedditResearchRun({ status: "failed", trigger, postsScanned: candidates.length, commentsScanned, error: `synthesis: ${msg}` });
    return { status: "failed", reason: `Theme synthesis failed: ${msg}`, postsScanned: candidates.length, commentsScanned };
  }

  const seed = `reddit-research-${new Date().toISOString().slice(0, 10)}`;
  const template = pickCartoonTemplateForCategory(synthesis.category, seed);

  let stillUrl: string, stillMime: string;
  try {
    const still = await withRetry("still generation", () =>
      generateCampaignStill({ prompt: "", stillTemplateId: template.id, category: synthesis.category, seed, createCalendarPost: false })
    );
    stillUrl = still.assetUrl;
    stillMime = still.mimeType;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    saveRedditResearchRun({ status: "failed", trigger, postsScanned: candidates.length, commentsScanned, category: synthesis.category, themeSummary: synthesis.themeSummary, error: `image gen: ${msg}` });
    return { status: "failed", reason: `Still generation failed: ${msg}`, postsScanned: candidates.length, commentsScanned, category: synthesis.category, themeSummary: synthesis.themeSummary };
  }

  const { caption } = publicCaptionForSlot({ category: synthesis.category, title: `Day ${dayOfYear()}` });
  const postId = crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO scheduled_posts(
      id, title, network, scheduled_at, status, auto_post, caption,
      content_type, media_url, media_type, generation_status, category, still_template_id
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    postId,
    `Reddit signal — ${synthesis.category} (auto)`.slice(0, 180),
    "instagram",
    now,
    "approved",
    1,
    caption,
    "image",
    stillUrl,
    stillMime,
    "ready",
    synthesis.category,
    template.id
  );

  // Fire the existing publish pipeline immediately so this goes live right
  // away instead of waiting for its next 60s scheduled tick. A failure here
  // is not a pipeline failure — the row is already queued with auto_post=1
  // and status='approved', so the normal running calendar-publisher loop
  // will pick it up and retry on its own within the minute regardless.
  let published = false;
  try {
    await runCalendarPublisherOnce();
    const row = db.prepare("SELECT status FROM scheduled_posts WHERE id=?").get(postId) as { status: string } | undefined;
    published = row?.status === "published";
  } catch (e) {
    console.warn("[reddit-research] immediate publish attempt failed, will retry on the normal publisher loop:", e instanceof Error ? e.message : e);
  }

  saveRedditResearchRun({
    status: "success",
    trigger,
    postsScanned: candidates.length,
    commentsScanned,
    category: synthesis.category,
    themeSummary: synthesis.themeSummary,
    scheduledPostId: postId
  });

  return {
    status: "success",
    postsScanned: candidates.length,
    commentsScanned,
    category: synthesis.category,
    themeSummary: synthesis.themeSummary,
    scheduledPostId: postId,
    published
  };
}

export { hasScheduledRunToday };
