// lib/settings.ts — Claw-only.
//
// 2026-08-30 "Claw only" repo strip. The previous version of this file
// returned a single EngineSettings blob covering every provider, image
// model, scraper, search backend, and E2B sandbox config the old build
// used. All of those subsystems are gone. What remains is the minimum
// the Integrations page (Composio) and the Claw health endpoint need:
//   - read/write the `composio_api_key` setting (encrypted at rest)
//   - read whether Composio, Steel, ScreenshotOne, and the NVIDIA
//     LLM are configured
//   - list the connected Composio toolkits (used by the /integrations
//     page to render the toolkit list)
// Anything beyond that is now a no-op or a thin pass-through; callers
// that previously reached for a video provider or image model should
// be using composio_action with the appropriate slug instead.

import { db } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { isComposioConfigured } from "@/lib/composio/client";
import { isSteelConfigured } from "@/lib/steel";
import { isScreenshotOneConfigured } from "@/lib/screenshotone";
import { isExaConfigured, isTavilyConfigured } from "@/lib/web-search";
import { isNvidiaEnabled } from "@/lib/nvidia/client";
import { PROVIDERS, type ProviderId } from "@/lib/providers";

const COMPOSIO_KEY_SETTING = "composio_api_key";

export function getComposioApiKey(): string | null {
  const row = db.prepare("SELECT value FROM settings WHERE key=?").get(COMPOSIO_KEY_SETTING) as { value: string } | undefined;
  if (!row) return null;
  try { return decryptSecret(row.value); } catch { return row.value; }
}

export function saveComposioApiKey(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return;
  const encrypted = encryptSecret(trimmed);
  db.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)").run(COMPOSIO_KEY_SETTING, encrypted);
}

export function clearComposioApiKey() {
  db.prepare("DELETE FROM settings WHERE key=?").run(COMPOSIO_KEY_SETTING);
}

// Claw's "is X configured" roll-up. The /integrations page uses this
// to render the green/red status chips per service.
export function getIntegrationsStatus() {
  return {
    composio: { configured: isComposioConfigured() },
    nvidia: { enabled: isNvidiaEnabled() },
    steel: { configured: isSteelConfigured() },
    screenshotone: { configured: isScreenshotOneConfigured() },
    exa: { configured: isExaConfigured() },
    tavily: { configured: isTavilyConfigured() }
  };
}

// Lighter-weight than getEngineSettings(). Just enough for the
// /integrations page to render "Composio is connected, here are the
// 3 active toolkits".
export type IntegrationsSummary = ReturnType<typeof getIntegrationsStatus> & {
  composioToolkits: Array<{ id: string; label: string; status: string; lastSyncAt: string | null }>;
};

export function getIntegrationsSummary(): IntegrationsSummary {
  const status = getIntegrationsStatus();
  const toolkits: Array<{ id: string; label: string; status: string; lastSyncAt: string | null }> = [];
  if (status.composio.configured) {
    try {
      const rows = db.prepare(
        `SELECT toolkit, status, last_sync_at FROM connected_accounts WHERE UPPER(status)='ACTIVE' ORDER BY toolkit ASC`
      ).all() as Array<{ toolkit: string; status: string; last_sync_at: string | null }>;
      for (const r of rows) toolkits.push({ id: r.toolkit, label: r.toolkit, status: r.status, lastSyncAt: r.last_sync_at });
    } catch { /* best-effort */ }
  }
  return { ...status, composioToolkits: toolkits };
}

// Re-export for callers that used to grab a typed settings object.
export const settings = {
  get isNvidiaEnabled() { return isNvidiaEnabled(); },
  get isComposioConfigured() { return isComposioConfigured(); },
  get isSteelConfigured() { return isSteelConfigured(); }
};

export { NVIDIA_MODELS, isNvidiaModelId } from "@/lib/nvidia";

export type EngineSettings = {
  defaultProvider: ProviderId;
  providers: {
    veo: { keyConfigured: boolean; model: string };
    grok: { keyConfigured: boolean; model: string };
    a2e: { keyConfigured: boolean; model: string };
    hedra: { keyConfigured: boolean; model: string };
  };
  resolution: "720p" | "1080p" | "4k";
  aspectRatio: "9:16" | "16:9";
};

function getRaw(key: string): string | null {
  return (db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined)?.value ?? null;
}
function setRaw(key: string, value: string) {
  db.prepare("INSERT INTO settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").run(key, value);
}
function isProviderId(v: unknown): v is ProviderId {
  return v === "veo" || v === "grok" || v === "a2e" || v === "hedra";
}

export function saveGeminiApiKey(value: string) { setRaw("gemini_api_key", encryptSecret(value.trim())); }
export function saveXaiApiKey(value: string) { setRaw("xai_api_key", encryptSecret(value.trim())); }
export function saveA2eApiKey(value: string) { setRaw("a2e_api_key", encryptSecret(value.trim())); }
export function saveHedraApiKey(value: string) { setRaw("hedra_api_key", encryptSecret(value.trim())); }

export function getEngineSettings(): EngineSettings {
  const providerConfigured = (p: ProviderId): boolean => {
    const def = PROVIDERS[p];
    return Boolean(getRaw(def.settingsKey) || process.env[def.envKey]);
  };
  return {
    defaultProvider: (() => {
      const raw = getRaw("default_provider");
      return isProviderId(raw) ? raw : "hedra";
    })(),
    providers: {
      veo: { keyConfigured: providerConfigured("veo"), model: getRaw("veo_model") || PROVIDERS.veo.defaultModel },
      grok: { keyConfigured: providerConfigured("grok"), model: getRaw("grok_model") || PROVIDERS.grok.defaultModel },
      a2e: { keyConfigured: providerConfigured("a2e"), model: getRaw("a2e_model") || PROVIDERS.a2e.defaultModel },
      hedra: { keyConfigured: providerConfigured("hedra"), model: getRaw("hedra_model") || PROVIDERS.hedra.defaultModel },
    },
    resolution: ((getRaw("resolution") as EngineSettings["resolution"]) || "1080p"),
    aspectRatio: ((getRaw("aspect_ratio") as EngineSettings["aspectRatio"]) || "9:16"),
  };
}

export function saveEngineSettings(input: Partial<{
  defaultProvider: ProviderId;
  resolution: "720p" | "1080p" | "4k";
  aspectRatio: "9:16" | "16:9";
  veoModel: string;
  grokModel: string;
  a2eModel: string;
  hedraModel: string;
}>) {
  if (input.defaultProvider && isProviderId(input.defaultProvider)) setRaw("default_provider", input.defaultProvider);
  if (input.resolution) setRaw("resolution", input.resolution);
  if (input.aspectRatio) setRaw("aspect_ratio", input.aspectRatio);
  if (input.veoModel) setRaw("veo_model", input.veoModel);
  if (input.grokModel) setRaw("grok_model", input.grokModel);
  if (input.a2eModel) setRaw("a2e_model", input.a2eModel);
  if (input.hedraModel) setRaw("hedra_model", input.hedraModel);
}
