// NVIDIA Content Intelligence.
//
// Given a campaign + a generated video's metadata + the campaign website
// context, produce a structured SocialContentPackage. The contract is
// documented in lib/nvidia/schemas.ts; we validate before the package leaves
// this module so the database never holds unvalidated copy.
//
// IMPORTANT: this is a one-shot deterministic function. The result is
// persisted against the campaign; subsequent page loads render the stored
// package, they do NOT re-call NVIDIA. Operators edit the package in the UI;
// the original AI copy is preserved alongside the human edits so the monitor
// can later learn from human copy decisions.

import crypto from "node:crypto";
import { chatCompletion, isNvidiaEnabled, getNvidiaModel, NvidiaAuthError, NvidiaDisabledError, NvidiaUpstreamError } from "./client";
import { parseSocialContentPackage, parsePlatformCopy, SchemaError, type SocialContentPackage, type PlatformCopy, type PlatformKey } from "./schemas";

export type ContentWriterInput = {
  campaign: {
    id: string;
    name: string;
    category: string;
    website?: string | null;
    mission?: string | null;
    tone?: string | null;
    platform?: string | null;
    targetAudience?: string | null;
    siteContext?: string | null;
  };
  video?: {
    id: string;
    provider: string;
    model: string;
    prompt: string;
    aspectRatio: string;
    resolution: string;
    outputPath: string;
  } | null;
  avatar?: {
    id: string;
    name: string;
    archetype: string;
    wardrobeStandard: string;
  } | null;
  // promptRagCandidates: short slugs of the prompt-library files actually
  // considered for this campaign. Recorded into the package provenance.
  promptRagCandidates?: string[];
};

const SYSTEM_PROMPT = `You are NVIDIA Content Intelligence for a video advertising engine.

Your job: given a campaign, a video asset, an avatar, and a brand context, write the social-media package that goes with the video.

Output ONLY valid JSON. No prose, no markdown fences, no commentary.

Constraints:
- Keep copy truthful. NEVER invent testimonials, statistics, awards, or results.
- Keep claims brand-safe for personal-injury / law-firm marketing: no promises of settlements, no fabricated client outcomes, no specific dollar figures unless the user supplied them.
- Hook must be under 240 chars and speak to a cold viewer in the first 1-2 seconds.
- shortCaption <= 280 chars (Twitter / OG description).
- longCaption <= 2200 chars (LinkedIn / blog / IG long-form).
- reelTitle <= 100 chars (YouTube Shorts / IG Reels).
- primaryText <= 1500 chars (Facebook primary text).
- cta <= 120 chars.
- Hashtags: 3-15 short tags, no # symbol (caller strips it), no spaces.
- For each platform variant, write copy that fits that platform's tone and length norms.
- x.primaryText (the tweet text) MUST be 280 characters or fewer, no hashtags stuffed at the end — write it like a real tweet.
- linkedin.primaryText is longer-form and professional: no emoji spam, framed for a business/decision-maker audience, 2-4 short paragraphs.
- reddit.title is the submission title (no clickbait, no ALL CAPS); reddit.primaryText is the self-post body — conversational, no marketing tone, discloses it's from the business when relevant (Reddit communities penalize undisclosed self-promotion).

JSON contract:
{
  "hook": "string",
  "primaryText": "string",
  "shortCaption": "string",
  "longCaption": "string",
  "reelTitle": "string",
  "cta": "string",
  "hashtags": ["string", ...],
  "platformVariants": {
    "instagram": { "primaryText": "...", "title": "...", "description": "...", "cta": "...", "hashtags": ["..."] },
    "facebook":  { "primaryText": "..." },
    "youtube":   { "primaryText": "...", "title": "...", "description": "..." },
    "tiktok":    { "primaryText": "...", "cta": "..." },
    "x":         { "primaryText": "<=280 chars" },
    "linkedin":  { "primaryText": "..." },
    "reddit":    { "title": "...", "primaryText": "self-post body" }
  },
  "provenance": { "model": "...", "rationale": "1-2 sentences explaining choices" }
}`;

function safeStr(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function buildUserPrompt(input: ContentWriterInput): string {
  const c = input.campaign;
  const v = input.video;
  const a = input.avatar;
  const rag = input.promptRagCandidates?.length ? input.promptRagCandidates.join(", ") : "(none)";
  return [
    `Campaign:`,
    `- id: ${c.id}`,
    `- name: ${c.name}`,
    `- category: ${c.category}`,
    c.website ? `- website: ${c.website}` : `- website: (not provided)`,
    c.mission ? `- mission: ${c.mission}` : `- mission: (not provided)`,
    c.tone ? `- tone: ${c.tone}` : `- tone: (not provided)`,
    c.platform ? `- primary platform: ${c.platform}` : `- primary platform: (not provided)`,
    c.targetAudience ? `- target audience: ${c.targetAudience}` : `- target audience: (not provided)`,
    c.siteContext ? `- site context: ${c.siteContext}` : `- site context: (not provided)`,
    a ? `\nAvatar:\n- ${a.name} (${a.archetype}); wardrobe: ${a.wardrobeStandard}` : `\nAvatar: (none selected)`,
    v ? `\nVideo:\n- provider=${v.provider} model=${v.model} aspect=${v.aspectRatio} resolution=${v.resolution}\n- Veo prompt (verbatim, the only authoritative video brief):\n${v.prompt}` : `\nVideo: (no video generated yet — write the package as if the avatar will be on-screen in the supplied wardrobe and context)`,
    `\nPrompt RAG candidates considered: ${rag}`,
    `\nReturn the JSON object now.`
  ].join("\n");
}

export type ContentWriterResult = {
  package: SocialContentPackage;
  inputHash: string;   // sha256 of the prompt inputs, for dedupe
};

export class NvidiaContentError extends Error {
  cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "NvidiaContentError";
    this.cause = cause;
  }
}

export async function writeSocialPackage(input: ContentWriterInput): Promise<ContentWriterResult> {
  if (!isNvidiaEnabled()) {
    throw new NvidiaDisabledError();
  }
  const model = getNvidiaModel();
  if (model === "disabled") throw new NvidiaDisabledError();

  const inputHash = crypto.createHash("sha256").update(JSON.stringify({
    campaign: input.campaign,
    video: input.video,
    avatar: input.avatar,
    promptRagCandidates: input.promptRagCandidates ?? []
  })).digest("hex");

  let response;
  try {
    response = await chatCompletion({
      model,
      temperature: 0.7,
      topP: 0.9,
      maxTokens: 1600,
      jsonMode: true,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(input) }
      ]
    });
  } catch (e) {
    if (e instanceof NvidiaAuthError || e instanceof NvidiaUpstreamError) throw e;
    throw new NvidiaContentError("NVIDIA call failed", e);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(response.text);
  } catch (e) {
    // Some models wrap JSON in ```json fences despite the instruction. Strip and retry once.
    const stripped = response.text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    try {
      parsed = JSON.parse(stripped);
    } catch {
      throw new NvidiaContentError(`NVIDIA returned non-JSON (finish=${response.finishReason})`, e);
    }
  }

  let pkg: SocialContentPackage;
  try {
    pkg = parseSocialContentPackage(parsed, model);
  } catch (e) {
    if (e instanceof SchemaError) throw new NvidiaContentError(`NVIDIA output failed validation: ${e.message}`, e);
    throw e;
  }
  pkg.provenance.inputs = {
    campaignId: input.campaign.id,
    campaignName: input.campaign.name,
    category: input.campaign.category,
    videoId: input.video?.id ?? null,
    videoProvider: input.video?.provider ?? null,
    avatarId: input.avatar?.id ?? null,
    promptRagCandidates: input.promptRagCandidates ?? []
  };
  pkg.provenance.rationale = safeStr(pkg.provenance.rationale, "").slice(0, 800) || "AI copy generated from campaign context.";
  return { package: pkg, inputHash };
}

// Standalone one-off post writer: "write me a LinkedIn post about X" with no
// underlying campaign/video. Reuses the same NVIDIA client and the same
// per-platform validation as writeSocialPackage's platformVariants, but
// skips the full SocialContentPackage shape since there's nothing to
// generate variants of other than the one requested platform.
export type StandalonePostInput = {
  topic: string;
  platform: PlatformKey;
  tone?: string | null;
  siteContext?: string | null;
};

const STANDALONE_SYSTEM_PROMPT = `You are an AI content writer for a marketing engine. Given a topic, a target platform, and an optional tone, write one ready-to-post piece of copy for that platform.

Output ONLY valid JSON. No prose, no markdown fences, no commentary.

Constraints:
- Keep copy truthful. NEVER invent testimonials, statistics, awards, results, or facts not supplied in the topic/context.
- Never promise guaranteed outcomes or fabricate case/client results.
- x: primaryText <= 280 characters, no stuffed hashtags.
- linkedin: primaryText is longer-form and professional, 2-4 short paragraphs, no emoji spam.
- reddit: title is the submission title (no clickbait), primaryText is a conversational self-post body that discloses it is from the business when relevant.
- instagram/facebook/tiktok: primaryText is a normal caption; hashtags are 3-15 short tags with no # symbol.
- youtube: primaryText is the video description; title is the video title.

JSON contract: { "primaryText": "string", "title": "string (optional)", "description": "string (optional)", "cta": "string (optional)", "hashtags": ["string", ...] (optional) }`;

export async function writeStandalonePost(input: StandalonePostInput): Promise<PlatformCopy> {
  if (!isNvidiaEnabled()) throw new NvidiaDisabledError();
  const model = getNvidiaModel();
  if (model === "disabled") throw new NvidiaDisabledError();

  const userPrompt = [
    `Platform: ${input.platform}`,
    `Topic: ${input.topic}`,
    input.tone ? `Tone: ${input.tone}` : `Tone: (default for the platform)`,
    input.siteContext ? `Site/brand context: ${input.siteContext}` : `Site/brand context: (none provided)`,
    `Return the JSON object now.`
  ].join("\n");

  let response;
  try {
    response = await chatCompletion({
      model,
      temperature: 0.7,
      topP: 0.9,
      maxTokens: 900,
      jsonMode: true,
      messages: [
        { role: "system", content: STANDALONE_SYSTEM_PROMPT },
        { role: "user", content: userPrompt }
      ]
    });
  } catch (e) {
    if (e instanceof NvidiaAuthError || e instanceof NvidiaUpstreamError) throw e;
    throw new NvidiaContentError("NVIDIA call failed", e);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(response.text);
  } catch {
    const stripped = response.text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    try {
      parsed = JSON.parse(stripped);
    } catch (e) {
      throw new NvidiaContentError(`NVIDIA returned non-JSON (finish=${response.finishReason})`, e);
    }
  }

  try {
    return parsePlatformCopy(parsed, "post", input.platform);
  } catch (e) {
    if (e instanceof SchemaError) throw new NvidiaContentError(`NVIDIA output failed validation: ${e.message}`, e);
    throw e;
  }
}
