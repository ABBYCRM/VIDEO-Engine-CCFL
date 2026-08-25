import { campaignTemplates, type CampaignCategory } from "@/lib/prompts";
import { visualTemplates, type VisualTemplateId } from "@/lib/visual-templates";
import { PROVIDERS, type ProviderId } from "@/lib/providers";
import { getA2eModel } from "@/lib/a2e-model-catalog";

const ALLOWED_PROVIDERS = new Set<ProviderId>(["veo", "grok", "a2e", "hedra"]);

function nearest(value: number, allowed: number[]) {
  if (!allowed.length) return value;
  return allowed.reduce((best, current) => Math.abs(current - value) < Math.abs(best - value) ? current : best, allowed[0]);
}

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

  const model: string | undefined = body?.model ? String(body.model).slice(0, 80) : undefined;
  if (model && provider && !PROVIDERS[provider].modelChoices.includes(model)) {
    throw new Error(`Unsupported ${PROVIDERS[provider].label} model: ${model}`);
  }

  const requestedDuration = Number(body?.durationSeconds);
  let durationSeconds: number;
  if (provider === "a2e") {
    const def = getA2eModel(model || PROVIDERS.a2e.defaultModel);
    if (!def) throw new Error("Invalid A2E model");
    const wanted = Number.isFinite(requestedDuration) ? Math.round(requestedDuration) : def.durations[def.durations.length - 1];
    durationSeconds = nearest(wanted, def.durations);
  } else {
    const durationCap = provider ? PROVIDERS[provider].durationCap : 8;
    durationSeconds = Number.isFinite(requestedDuration)
      ? Math.max(1, Math.min(durationCap, Math.round(requestedDuration)))
      : provider === "hedra" ? 30 : durationCap;
  }

  const avatarId = body?.avatarId ? String(body.avatarId).trim().slice(0, 120) : undefined;
  if (provider === "a2e" && model === "video-twin" && !avatarId) {
    throw new Error("A2E Video Twin requires a selected canonical avatar.");
  }

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
    avatarId,
    imageBase64: body?.imageBase64 ? String(body.imageBase64) : undefined,
    imageMimeType: body?.imageMimeType ? String(body.imageMimeType) : undefined,
    audioBase64: body?.audioBase64 ? String(body.audioBase64) : undefined,
    audioMimeType: body?.audioMimeType ? String(body.audioMimeType) : undefined
  };
}
