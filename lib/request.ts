import { campaignTemplates, type CampaignCategory } from "@/lib/prompts";
import { PROVIDERS, type ProviderId } from "@/lib/providers";

const ALLOWED_PROVIDERS = new Set<ProviderId>(["veo", "grok", "a2e"]);

export function parseGenerationBody(body: any) {
  const category = body?.category as CampaignCategory;
  if (!(category in campaignTemplates)) throw new Error("Invalid category");

  const resolution = body?.resolution;
  if (resolution && !["720p", "1080p", "4k"].includes(resolution)) throw new Error("Invalid resolution");

  const aspectRatio = body?.aspectRatio;
  if (aspectRatio && !["9:16", "16:9"].includes(aspectRatio)) throw new Error("Invalid aspect ratio");

  const provider = body?.provider as ProviderId | undefined;
  if (provider && !ALLOWED_PROVIDERS.has(provider)) throw new Error("Invalid provider");

  if (body?.imageBase64 && !body?.imageMimeType) throw new Error("imageMimeType is required with imageBase64");
  if (body?.imageBase64 && Buffer.byteLength(body.imageBase64, "base64") > 10 * 1024 * 1024) throw new Error("Reference image must be 10MB or smaller");

  // Per-provider model validation: if user provides model, it must be in the
  // provider's choice list, otherwise drop it (default applies).
  let model: string | undefined = body?.model ? String(body.model).slice(0, 80) : undefined;
  if (model && provider && !PROVIDERS[provider].modelChoices.includes(model)) {
    model = undefined;
  }

  return {
    provider,
    category,
    mission: String(body?.mission || "").slice(0, 4000),
    subject: String(body?.subject || "").slice(0, 1000),
    script: String(body?.script || "").slice(0, 1500),
    resolution,
    aspectRatio,
    model,
    imageBase64: body?.imageBase64 ? String(body.imageBase64) : undefined,
    imageMimeType: body?.imageMimeType ? String(body.imageMimeType) : undefined
  };
}
