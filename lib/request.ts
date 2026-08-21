import { campaignTemplates, type CampaignCategory } from "@/lib/prompts";
import { PROVIDERS, type ProviderId } from "@/lib/providers";

const ALLOWED_PROVIDERS = new Set<ProviderId>(["veo", "grok", "a2e", "hedra"]);

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
  if (body?.audioBase64 && !body?.audioMimeType) throw new Error("audioMimeType is required with audioBase64");
  if (body?.audioBase64 && Buffer.byteLength(body.audioBase64, "base64") > 105 * 1024 * 1024) throw new Error("Driving audio must be 105MB or smaller");

  let model: string | undefined = body?.model ? String(body.model).slice(0, 80) : undefined;
  if (model && provider && !PROVIDERS[provider].modelChoices.includes(model)) model = undefined;

  const requestedDuration = Number(body?.durationSeconds);
  const durationCap = provider ? PROVIDERS[provider].durationCap : 8;
  const durationSeconds = Number.isFinite(requestedDuration)
    ? Math.max(1, Math.min(durationCap, Math.round(requestedDuration)))
    : provider === "hedra" ? 30 : durationCap;

  return {
    provider,
    category,
    mission: String(body?.mission || "").slice(0, 4000),
    subject: String(body?.subject || "").slice(0, 1000),
    script: String(body?.script || "").slice(0, 5000),
    resolution,
    aspectRatio,
    model,
    durationSeconds,
    imageBase64: body?.imageBase64 ? String(body.imageBase64) : undefined,
    imageMimeType: body?.imageMimeType ? String(body.imageMimeType) : undefined,
    audioBase64: body?.audioBase64 ? String(body.audioBase64) : undefined,
    audioMimeType: body?.audioMimeType ? String(body.audioMimeType) : undefined
  };
}
