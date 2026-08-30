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

  // Validation-retry helper (same pattern as writeStandalonePost below).
  // Schema failures — most often the model returning hashtags as a single
  // string instead of a string[] — get one corrective retry instead of an
  // immediate throw. 5xx upstream errors don't get this treatment; the
  // NVIDIA client already retries those internally.
  const attempt = async (): Promise<SocialContentPackage> => {
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
    return parseSocialContentPackage(parsed, model);
  };

  let pkg: SocialContentPackage;
  try {
    pkg = await attempt();
  } catch (e) {
    if (!(e instanceof SchemaError)) {
      if (e instanceof NvidiaContentError) throw e;
      throw e;
    }
    // One corrective retry. Most common case: hashtags returned as a
    // single string. The corrective prompt tells the model exactly
    // which field is wrong and what shape it expects.
    const corrective = `Your previous response failed JSON schema validation with: ${e.message}. Re-emit the JSON object with the offending field corrected. The hashtags field MUST be a JSON array of strings (["tag1", "tag2"]) or omitted entirely — never a single string, never an object. Return only the corrected JSON.`;
    try {
      // We re-run the same attempt but with the corrective prompt
      // tacked onto the user message.
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
            { role: "user", content: `${buildUserPrompt(input)}\n\n${corrective}` }
          ]
        });
      } catch (e2) {
        if (e2 instanceof NvidiaAuthError || e2 instanceof NvidiaUpstreamError) throw e2;
        throw new NvidiaContentError("NVIDIA call failed (retry)", e2);
      }
      let parsed: unknown;
      try { parsed = JSON.parse(response.text); } catch {
        const stripped = response.text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
        try { parsed = JSON.parse(stripped); } catch (e2) { throw new NvidiaContentError(`NVIDIA returned non-JSON on retry (finish=${response.finishReason})`, e2); }
      }
      try {
        pkg = parseSocialContentPackage(parsed, model);
      } catch (e2) {
        if (e2 instanceof SchemaError) throw new NvidiaContentError(`NVIDIA output failed validation after retry: ${e2.message}`, e2);
        throw e2;
      }
    } catch (e2) {
      // Both calls failed validation. Surface the original schema error
      // so the caller sees the most informative message.
      if (e2 instanceof NvidiaContentError) throw e2;
      throw e;
    }
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

JSON contract (FOLLOW EXACTLY — every field type matters):
{
  "primaryText": "string (REQUIRED, non-empty)",
  "title": "string (optional, may be omitted entirely if not relevant)",
  "description": "string (optional)",
  "cta": "string (optional)",
  "hashtags": ["string", "string", "string"]  // ALWAYS a JSON array of strings when present, NEVER a single string, NEVER an object, NEVER null. Omit the field entirely if no hashtags.
}

Common mistakes to avoid:
- hashtags as a single string like "#foo #bar" → WRONG. Use an array: ["#foo", "#bar"] (or strip the # and use ["foo", "bar"])
- hashtags as a JSON object → WRONG. Use an array.
- title as an object → WRONG. Use a string or omit it.`;

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

  // Validation-retry helper: schema failures (the most common one in
  // practice is the model returning hashtags as a string instead of a
  // string[]) get one retry with a corrective message instead of an
  // immediate throw. The retry is a 2nd NVIDIA call so it costs a few
  // hundred ms but recovers most near-miss outputs that would
  // otherwise break an operator-facing flow. HTTP 5xx errors don't get
  // this treatment — they're true transient failures and the upstream
  // client already retries them internally.
  const attempt = async (systemPrompt: string, userMsg: string): Promise<PlatformCopy> => {
    let response;
    try {
      response = await chatCompletion({
        model,
        temperature: 0.7,
        topP: 0.9,
        maxTokens: 900,
        jsonMode: true,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMsg }
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
    return parsePlatformCopy(parsed, "post", input.platform);
  };

  try {
    return await attempt(STANDALONE_SYSTEM_PROMPT, userPrompt);
  } catch (e) {
    if (!(e instanceof SchemaError)) {
      if (e instanceof NvidiaContentError) throw e;
      throw e;
    }
    // One retry with the exact failure surfaced to the model. Most
    // common case: model returns `hashtags: "#foo #bar"` (single
    // string) and the schema wants an array. The retry message tells
    // the model exactly what to fix.
    const corrective = `Your previous response failed JSON schema validation with: ${e.message}. Please re-emit the JSON object with the offending field corrected. The hashtags field MUST be a JSON array of strings (e.g. ["tag1", "tag2", "tag3"]) or omitted entirely — never a single string, never an object. If you returned hashtags as a single string, split it into an array of individual tags. Return only the corrected JSON.`;
    try {
      return await attempt(STANDALONE_SYSTEM_PROMPT, `${userPrompt}\n\n${corrective}`);
    } catch (e2) {
      if (e2 instanceof NvidiaContentError) throw e2;
      if (e2 instanceof SchemaError) throw new NvidiaContentError(`NVIDIA output failed validation after retry: ${e2.message}`, e2);
      throw e2;
    }
  }
}
