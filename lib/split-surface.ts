import { getA2eModel } from "@/lib/a2e-model-catalog";
import { db } from "@/lib/db";
import type { ProviderId } from "@/lib/providers";
import { DEFAULT_SPLIT_TEMPLATE_ID, isSplitTemplateId, type SplitTemplateId } from "@/lib/split-templates";

export const SPLIT_RELATIONSHIPS = [
  "anchor_field",
  "question_answer",
  "context_commentary",
  "reaction",
  "parallel"
] as const;
export type SplitRelationship = typeof SPLIT_RELATIONSHIPS[number];
export type UpperProviderId = Exclude<ProviderId, "hedra">;

export const DEFAULT_SPLIT_PERCENT = 35;
export const DEFAULT_SPLIT_RELATIONSHIP: SplitRelationship = "anchor_field";

function ensureCampaignColumn(name: string, ddl: string) {
  try {
    const cols = db.prepare("PRAGMA table_info(campaigns)").all() as { name: string }[];
    if (!cols.some((c) => c.name === name)) db.exec(`ALTER TABLE campaigns ADD COLUMN ${ddl}`);
  } catch {}
}

export function ensureSplitSurfaceColumns() {
  ensureCampaignColumn("video_model", "video_model TEXT");
  ensureCampaignColumn("upper_provider", "upper_provider TEXT");
  ensureCampaignColumn("upper_model", "upper_model TEXT");
  ensureCampaignColumn("split_percent", "split_percent INTEGER NOT NULL DEFAULT 35");
  ensureCampaignColumn("split_relationship", "split_relationship TEXT NOT NULL DEFAULT 'anchor_field'");
  ensureCampaignColumn("split_template", `split_template TEXT NOT NULL DEFAULT '${DEFAULT_SPLIT_TEMPLATE_ID}'`);
}

export function clampSplitPercent(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_SPLIT_PERCENT;
  return Math.max(25, Math.min(45, Math.round(n)));
}

export function normalizeSplitRelationship(value: unknown): SplitRelationship {
  const raw = String(value || "").trim();
  return (SPLIT_RELATIONSHIPS as readonly string[]).includes(raw) ? (raw as SplitRelationship) : DEFAULT_SPLIT_RELATIONSHIP;
}

export function isProviderId(value: string): value is ProviderId {
  return value === "veo" || value === "grok" || value === "a2e" || value === "hedra";
}

export function isUpperProvider(value: string): value is UpperProviderId {
  return value === "veo" || value === "grok" || value === "a2e";
}

export function normalizeUpperProvider(value: unknown, lowerProvider?: string): UpperProviderId {
  const raw = String(value || "").trim();
  if (isUpperProvider(raw)) return raw;
  if (raw === "hedra") return "grok";
  const lower = String(lowerProvider || "").trim();
  if (isUpperProvider(lower)) return lower;
  return "grok";
}

export function unattendedLaneProvider(provider: ProviderId, model?: string | null): ProviderId {
  if (provider === "hedra") return "grok";
  if (provider === "a2e") {
    const def = getA2eModel(model || "");
    if (def?.requiresAudio || def?.requiresTwin) return "grok";
  }
  return provider;
}

export function nextLaneFallback(failed: ProviderId): ProviderId | null {
  if (failed === "a2e") return "grok";
  if (failed === "grok") return "veo";
  if (failed === "hedra") return "grok";
  return null;
}

export function laneModel(provider: ProviderId, requested?: string | null) {
  if (requested && requested.trim()) return requested.trim();
  if (provider === "grok") return "grok-imagine-video-1.5";
  if (provider === "veo") return "veo-3.1-generate-preview";
  // Kling 3.0: A2E's most photorealistic human-motion model. Takes the
  // avatar's reference photo as an image-to-video source (preserving
  // identity) and always generates native audio at this version.
  if (provider === "a2e") return "kling3";
  return undefined;
}

export type SplitSurface = {
  splitPercent: number;
  splitRelationship: SplitRelationship;
  splitTemplate: SplitTemplateId;
  videoProvider: ProviderId;
  videoModel: string | null;
  upperProvider: UpperProviderId;
  upperModel: string | null;
};

export function parseSplitSurface(body: any, fallbackLower: string): SplitSurface {
  const videoProvider = isProviderId(String(body.videoProvider || fallbackLower)) ? (String(body.videoProvider || fallbackLower) as ProviderId) : "grok";
  const upperProvider = normalizeUpperProvider(body.upperProvider, videoProvider);
  return {
    splitPercent: clampSplitPercent(body.splitPercent),
    splitRelationship: normalizeSplitRelationship(body.splitRelationship),
    splitTemplate: isSplitTemplateId(body.splitTemplate) ? body.splitTemplate : DEFAULT_SPLIT_TEMPLATE_ID,
    videoProvider,
    videoModel: body.videoModel ? String(body.videoModel).slice(0, 120) : null,
    upperProvider,
    upperModel: body.upperModel ? String(body.upperModel).slice(0, 120) : null
  };
}
