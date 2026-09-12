import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { A2E_VIDEO_MODEL_IDS } from "@/lib/a2e-model-catalog";

export type ProviderId = "veo" | "grok" | "a2e" | "hedra";

export const PROVIDERS: Record<ProviderId, {
  id: ProviderId;
  label: string;
  defaultModel: string;
  modelChoices: string[];
  durationCap: number;
  supportsImage: boolean;
  envKey: string;
  settingsKey: string;
}> = {
  veo: {
    id: "veo",
    label: "Google Veo 3.1 (direct)",
    defaultModel: "veo-3.1-generate-preview",
    modelChoices: ["veo-3.1-generate-preview", "veo-3.1-fast-generate-preview", "veo-3.1-lite-generate-preview"],
    durationCap: 8,
    supportsImage: true,
    envKey: "GEMINI_API_KEY",
    settingsKey: "gemini_api_key",
  },
  grok: {
    id: "grok",
    label: "xAI Grok Imagine",
    defaultModel: "grok-imagine-video-1.5",
    modelChoices: ["grok-imagine-video-1.5", "grok-imagine-video-1.0"],
    durationCap: 8,
    supportsImage: true,
    envKey: "XAI_API_KEY",
    settingsKey: "xai_api_key",
  },
  a2e: {
    id: "a2e",
    label: "A2E AI multi-model",
    defaultModel: "seedance2.5",
    modelChoices: A2E_VIDEO_MODEL_IDS.filter((id) => id !== "video-twin"),
    durationCap: 8,
    supportsImage: true,
    envKey: "A2E_API_KEY",
    settingsKey: "a2e_api_key",
  },
  hedra: {
    id: "hedra",
    label: "Hedra Character / Avatar",
    defaultModel: "fal/grok-video-i2v",
    modelChoices: ["fal/grok-video-i2v", "fal/grok-video-t2v", "hedra-character-3", "hedra-character-2", "together/hedra-avatar"],
    durationCap: 8,
    supportsImage: true,
    envKey: "HEDRA_API_KEY",
    settingsKey: "hedra_api_key",
  },
};

export function listProviderIds(): ProviderId[] {
  return ["hedra", "a2e", "grok", "veo"];
}

export function getProviderKey(p: ProviderId): string {
  const def = PROVIDERS[p];
  const encrypted = (db.prepare("SELECT value FROM settings WHERE key = ?").get(def.settingsKey) as { value: string } | undefined)?.value;
  if (encrypted) return decryptSecret(encrypted);
  const env = process.env[def.envKey];
  if (env) return env;
  throw new Error(`${def.label} API key is not configured`);
}

export function getProviderModel(p: ProviderId): string {
  const def = PROVIDERS[p];
  return (db.prepare("SELECT value FROM settings WHERE key = ?").get(`${p}_model`) as { value: string } | undefined)?.value || def.defaultModel;
}

export function getDefaultProvider(): ProviderId {
  const raw = (db.prepare("SELECT value FROM settings WHERE key = ?").get("default_provider") as { value: string } | undefined)?.value;
  if (raw === "veo" || raw === "grok" || raw === "a2e" || raw === "hedra") return raw;
  return "hedra";
}
