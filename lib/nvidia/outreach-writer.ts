// Influencer Agent outreach writer: drafts a first-contact message to one
// creator. Same chatCompletion(jsonMode) contract as every other NVIDIA
// writer module.

import { chatCompletion, getNvidiaModel, isNvidiaEnabled, NvidiaAuthError, NvidiaDisabledError, NvidiaUpstreamError } from "./client";

export type OutreachDraft = { subject: string; message: string };

export class NvidiaOutreachError extends Error {
  cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "NvidiaOutreachError";
    this.cause = cause;
  }
}

const SYSTEM_PROMPT = `You draft a first-contact outreach message from a business to a content creator/influencer, proposing a collaboration.

Output ONLY valid JSON. No prose, no markdown fences, no commentary.

Rules:
- Never invent budget figures, deliverables, or claims the operator did not supply.
- Keep it short, personable, and specific to the creator's niche — not a form-letter template.
- Clearly identify who is reaching out and why.
- End with a low-pressure, specific call to action (e.g. "open to a quick chat?").
- subject is only used for email; keep it under 80 chars.

JSON contract: { "subject": "...", "message": "..." }`;

export async function writeOutreachMessage(input: {
  handle: string;
  platform: string;
  niche?: string | null;
  channel: "instagram_dm" | "email";
  brandContext?: string | null;
  proposal?: string | null;
}): Promise<OutreachDraft> {
  if (!isNvidiaEnabled()) throw new NvidiaDisabledError();
  const model = getNvidiaModel();
  if (model === "disabled") throw new NvidiaDisabledError();

  const userPrompt = [
    `Creator: @${input.handle} on ${input.platform}${input.niche ? ` (niche: ${input.niche})` : ""}`,
    `Outreach channel: ${input.channel === "email" ? "email" : "Instagram DM (keep it very short, DM-length)"}`,
    `Brand/business context: ${input.brandContext || "(not provided — write a generic but genuine intro)"}`,
    `Collaboration proposal: ${input.proposal || "(not specified — propose a general conversation about working together)"}`,
    `Return the JSON object now.`
  ].join("\n");

  let response;
  try {
    response = await chatCompletion({
      model,
      temperature: 0.7,
      maxTokens: 700,
      jsonMode: true,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt }
      ]
    });
  } catch (e) {
    if (e instanceof NvidiaAuthError || e instanceof NvidiaUpstreamError) throw e;
    throw new NvidiaOutreachError("NVIDIA call failed", e);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(response.text);
  } catch {
    const stripped = response.text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    try {
      parsed = JSON.parse(stripped);
    } catch (e) {
      throw new NvidiaOutreachError(`NVIDIA returned non-JSON (finish=${response.finishReason})`, e);
    }
  }

  const message = typeof parsed?.message === "string" ? parsed.message.trim().slice(0, 2000) : "";
  if (!message) throw new NvidiaOutreachError("Outreach writer returned an empty message");
  const subject = typeof parsed?.subject === "string" ? parsed.subject.trim().slice(0, 120) : `Collaboration idea for @${input.handle}`;
  return { subject, message };
}
