import { campaignTemplates, type CampaignCategory } from "@/lib/prompts";

export function parseGenerationBody(body: any) {
  const category = body?.category as CampaignCategory;
  if (!(category in campaignTemplates)) throw new Error("Invalid category");
  const resolution = body?.resolution;
  if (resolution && !["720p", "1080p", "4k"].includes(resolution)) throw new Error("Invalid resolution");
  const aspectRatio = body?.aspectRatio;
  if (aspectRatio && !["9:16", "16:9"].includes(aspectRatio)) throw new Error("Invalid aspect ratio");
  if (body?.imageBase64 && !body?.imageMimeType) throw new Error("imageMimeType is required with imageBase64");
  if (body?.imageBase64 && Buffer.byteLength(body.imageBase64, "base64") > 10 * 1024 * 1024) throw new Error("Reference image must be 10MB or smaller");
  return {
    category,
    mission: String(body?.mission || "").slice(0, 4000),
    subject: String(body?.subject || "").slice(0, 1000),
    script: String(body?.script || "").slice(0, 1500),
    resolution,
    aspectRatio,
    model: body?.model ? String(body.model).slice(0, 80) : undefined,
    imageBase64: body?.imageBase64 ? String(body.imageBase64) : undefined,
    imageMimeType: body?.imageMimeType ? String(body.imageMimeType) : undefined
  };
}
