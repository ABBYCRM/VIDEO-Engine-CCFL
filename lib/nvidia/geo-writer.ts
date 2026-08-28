// GEO (Generative-Engine Optimization) writer: given a published article's
// body, extract FAQ-style question/answer pairs and citable key facts an AI
// answer engine (ChatGPT/Perplexity/Google AI Overviews) could quote. Same
// chatCompletion(jsonMode) contract as every other NVIDIA writer module.

import { chatCompletion, getNvidiaModel, isNvidiaEnabled, NvidiaAuthError, NvidiaDisabledError, NvidiaUpstreamError } from "./client";

export type GeoFaqPair = { q: string; a: string };
export type GeoWriterResult = {
  faqPairs: GeoFaqPair[];
  keyFactsForCitation: string[];
  suggestedSchemaType: "FAQPage" | "Article";
};

export class NvidiaGeoError extends Error {
  cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "NvidiaGeoError";
    this.cause = cause;
  }
}

const SYSTEM_PROMPT = `You extract GEO (Generative-Engine Optimization) metadata from an already-written article so it can be cited cleanly by AI answer engines (ChatGPT, Perplexity, Google AI Overviews).

Output ONLY valid JSON. No prose, no markdown fences, no commentary.

Rules:
- Never invent facts, statistics, or claims that are not already stated in the supplied article body.
- faqPairs: 3-8 question/answer pairs that a reader would plausibly ask an AI assistant, answered ONLY using facts already in the article. Answers must be self-contained (2-4 sentences), directly answering the question first.
- keyFactsForCitation: 3-10 short, standalone factual statements lifted from the article, each written so it makes sense quoted out of context (include the subject, not just "it").
- suggestedSchemaType: "FAQPage" if faqPairs meaningfully cover the article's substance, otherwise "Article".

JSON contract: { "faqPairs": [{"q":"...","a":"..."}], "keyFactsForCitation": ["..."], "suggestedSchemaType": "FAQPage" | "Article" }`;

export async function writeGeoMetadata(input: { title: string; bodyMarkdown: string }): Promise<GeoWriterResult> {
  if (!isNvidiaEnabled()) throw new NvidiaDisabledError();
  const model = getNvidiaModel();
  if (model === "disabled") throw new NvidiaDisabledError();

  let response;
  try {
    response = await chatCompletion({
      model,
      temperature: 0.3,
      maxTokens: 1600,
      jsonMode: true,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Article title: ${input.title}\n\nArticle body:\n${input.bodyMarkdown.slice(0, 20000)}\n\nReturn the JSON object now.` }
      ]
    });
  } catch (e) {
    if (e instanceof NvidiaAuthError || e instanceof NvidiaUpstreamError) throw e;
    throw new NvidiaGeoError("NVIDIA call failed", e);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(response.text);
  } catch {
    const stripped = response.text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    try {
      parsed = JSON.parse(stripped);
    } catch (e) {
      throw new NvidiaGeoError(`NVIDIA returned non-JSON (finish=${response.finishReason})`, e);
    }
  }

  const faqPairs: GeoFaqPair[] = Array.isArray(parsed?.faqPairs)
    ? parsed.faqPairs
        .filter((x: any) => x && typeof x.q === "string" && typeof x.a === "string")
        .slice(0, 8)
        .map((x: any) => ({ q: String(x.q).trim().slice(0, 300), a: String(x.a).trim().slice(0, 1200) }))
    : [];
  const keyFactsForCitation: string[] = Array.isArray(parsed?.keyFactsForCitation)
    ? parsed.keyFactsForCitation.filter((x: any) => typeof x === "string").slice(0, 10).map((x: string) => x.trim().slice(0, 400))
    : [];
  const suggestedSchemaType = parsed?.suggestedSchemaType === "FAQPage" && faqPairs.length > 0 ? "FAQPage" : "Article";

  if (!faqPairs.length && !keyFactsForCitation.length) throw new NvidiaGeoError("GEO writer returned no FAQ pairs or key facts");

  return { faqPairs, keyFactsForCitation, suggestedSchemaType };
}
