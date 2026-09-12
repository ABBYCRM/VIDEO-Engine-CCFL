import { campaignTemplates, type CampaignCategory } from "@/lib/prompts";
import { PROVIDERS, type ProviderId } from "@/lib/providers";

const ALLOWED_PROVIDERS = new Set<ProviderId>(["veo", "grok", "a2e", "hedra"]);
const ONE_SHOT_SECONDS = 8;

export function parseGenerationBody(body: unknown) {
  const rec = (body && typeof body === "object") ? body as Record<string, unknown> : {};
  const category = rec.category as CampaignCategory;
  if (!(category in campaignTemplates)) throw new Error("Invalid category");

  const resolution = rec.resolution;
  if (resolution && !["720p", "1080p", "4k"].includes(String(resolution))) throw new Error("Invalid resolution");

  const aspectRatio = rec.aspectRatio;
  if (aspectRatio && !["9:16", "16:9"].includes(String(aspectRatio))) throw new Error("Invalid aspect ratio");

  const provider = rec.provider as ProviderId | undefined;
  if (provider && !ALLOWED_PROVIDERS.has(provider)) throw new Error("Invalid provider");

  const imageBase64 = rec.imageBase64 ? String(rec.imageBase64) : undefined;
  const imageMimeType = rec.imageMimeType ? String(rec.imageMimeType) : undefined;
  const audioBase64 = rec.audioBase64 ? String(rec.audioBase64) : undefined;
  const audioMimeType = rec.audioMimeType ? String(rec.audioMimeType) : undefined;

  if (imageBase64 && !imageMimeType) throw new Error("imageMimeType is required with imageBase64");
  if (imageBase64 && Buffer.byteLength(imageBase64, "base64") > 10 * 1024 * 1024) throw new Error("Reference image must be 10MB or smaller");
  if (audioBase64 && !audioMimeType) throw new Error("audioMimeType is required with audioBase64");
  if (audioBase64 && Buffer.byteLength(audioBase64, "base64") > 105 * 1024 * 1024) throw new Error("Driving audio must be 105MB or smaller");

  const model: string | undefined = rec.model ? String(rec.model).slice(0, 80) : undefined;
  if (model === "video-twin") throw new Error("A2E Video Twin is not available in this one-shot pipeline");
  if (model && provider && !PROVIDERS[provider].modelChoices.includes(model)) {
    throw new Error(`Unsupported ${PROVIDERS[provider].label} model: ${model}`);
  }

  return {
    provider,
    category,
    mission: String(rec.mission || "").slice(0, 4000),
    subject: String(rec.subject || "").slice(0, 1000),
    script: String(rec.script || "").slice(0, 5000),
    resolution: resolution as "720p" | "1080p" | "4k" | undefined,
    aspectRatio: aspectRatio as "9:16" | "16:9" | undefined,
    model,
    durationSeconds: ONE_SHOT_SECONDS,
    imageBase64,
    imageMimeType,
    audioBase64,
    audioMimeType,
  };
}
