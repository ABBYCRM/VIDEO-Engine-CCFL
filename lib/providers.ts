// Provider-agnostic contract. Each adapter (veo, grok, a2e) implements the
// start + poll + download flow. The job row stores which provider was used
// so refreshJob() can route back to the right adapter on every poll.

import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";

export type ProviderId = "veo" | "grok" | "a2e";

export const PROVIDERS: Record<ProviderId, {
  id: ProviderId;
  label: string;
  defaultModel: string;
  modelChoices: string[];
  durationCap: number; // max seconds the provider will do in one shot
  supportsImage: boolean;
  envKey: string; // process.env fallback name
  settingsKey: string; // encrypted key slot in settings table
}> = {
  veo: {
    id: "veo",
    label: "Google Veo 3.1 (direct)",
    defaultModel: "veo-3.1-generate-preview",
    modelChoices: [
      "veo-3.1-generate-preview",
      "veo-3.1-fast-generate-preview",
      "veo-3.1-lite-generate-preview"
    ],
    durationCap: 8,
    supportsImage: true,
    envKey: "GEMINI_API_KEY",
    settingsKey: "gemini_api_key"
  },
  grok: {
    id: "grok",
    label: "xAI Grok Imagine",
    defaultModel: "grok-imagine-video-1.5",
    modelChoices: [
      "grok-imagine-video-1.5",
      "grok-imagine-video-1.0"
    ],
    durationCap: 15,
    supportsImage: true,
    envKey: "XAI_API_KEY",
    settingsKey: "xai_api_key"
  },
  a2e: {
    id: "a2e",
    label: "A2E AI (multi-model router)",
    defaultModel: "veo3",
    modelChoices: [
      "veo3",
      "veo3_fast",
      "wan",
      "wan-3.0",
      "kling",
      "seedance",
      "sora"
    ],
    durationCap: 8,
    supportsImage: true,
    envKey: "A2E_API_KEY",
    settingsKey: "a2e_api_key"
  }
};

export function listProviderIds(): ProviderId[] {
  return ["veo", "grok", "a2e"];
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
  if (raw === "grok" || raw === "a2e" || raw === "veo") return raw;
  return "veo";
}
