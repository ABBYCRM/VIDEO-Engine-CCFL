// Influencer Agent discovery-extraction: given Markdown scraped from ONE
// operator-supplied public URL (a creator directory, a hashtag page, a
// "best X influencers" roundup, etc. via lib/steel.ts), extract structured
// candidate profiles. Never crawls a platform's own search/discovery
// surface itself — the operator picks the source URL, this only structures
// what's already on that one page.

import { chatCompletion, getNvidiaModel, isNvidiaEnabled, NvidiaAuthError, NvidiaDisabledError, NvidiaUpstreamError } from "./client";

export type InfluencerCandidate = {
  handle: string;
  platform: string;
  profileUrl: string | null;
  followerCount: number | null;
  niche: string | null;
  contactEmail: string | null;
};

export class NvidiaInfluencerError extends Error {
  cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "NvidiaInfluencerError";
    this.cause = cause;
  }
}

const SYSTEM_PROMPT = `You extract a list of content-creator/influencer candidates from a single scraped web page's Markdown content.

Output ONLY valid JSON. No prose, no markdown fences, no commentary.

Rules:
- Only extract creators actually named/linked on the supplied page. Never invent a handle, follower count, or email that isn't stated on the page.
- If a follower count isn't stated, use null rather than guessing.
- platform: infer from the profile URL/domain (instagram, tiktok, youtube, x, other) or from context; if unclear use "other".
- Return at most 25 candidates.

JSON contract: { "candidates": [{"handle":"...","platform":"instagram|tiktok|youtube|x|other","profileUrl":"..."|null,"followerCount":number|null,"niche":"..."|null,"contactEmail":"..."|null}] }`;

export async function extractInfluencerCandidates(input: { sourceUrl: string; markdown: string; nicheHint?: string | null }): Promise<InfluencerCandidate[]> {
  if (!isNvidiaEnabled()) throw new NvidiaDisabledError();
  const model = getNvidiaModel();
  if (model === "disabled") throw new NvidiaDisabledError();

  let response;
  try {
    response = await chatCompletion({
      model,
      temperature: 0.2,
      maxTokens: 2000,
      jsonMode: true,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Source page: ${input.sourceUrl}${input.nicheHint ? `\nOperator is looking for creators in this niche: ${input.nicheHint}` : ""}\n\nScraped page content:\n${input.markdown.slice(0, 40000)}\n\nReturn the JSON object now.`
        }
      ]
    });
  } catch (e) {
    if (e instanceof NvidiaAuthError || e instanceof NvidiaUpstreamError) throw e;
    throw new NvidiaInfluencerError("NVIDIA call failed", e);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(response.text);
  } catch {
    const stripped = response.text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    try {
      parsed = JSON.parse(stripped);
    } catch (e) {
      throw new NvidiaInfluencerError(`NVIDIA returned non-JSON (finish=${response.finishReason})`, e);
    }
  }

  const candidates: InfluencerCandidate[] = Array.isArray(parsed?.candidates)
    ? parsed.candidates
        .filter((x: any) => x && typeof x.handle === "string")
        .slice(0, 25)
        .map((x: any) => ({
          handle: String(x.handle).replace(/^@/, "").trim().slice(0, 100),
          platform: ["instagram", "tiktok", "youtube", "x", "other"].includes(x.platform) ? x.platform : "other",
          profileUrl: typeof x.profileUrl === "string" ? x.profileUrl.trim().slice(0, 500) : null,
          followerCount: Number.isFinite(x.followerCount) ? Math.round(x.followerCount) : null,
          niche: typeof x.niche === "string" ? x.niche.trim().slice(0, 200) : null,
          contactEmail: typeof x.contactEmail === "string" ? x.contactEmail.trim().slice(0, 200) : null
        }))
    : [];

  return candidates;
}
