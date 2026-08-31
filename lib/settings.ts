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
import { isComposioConfigured, getComposio } from "@/lib/composio/client";
import { isSteelConfigured } from "@/lib/steel";
import { isScreenshotOneConfigured } from "@/lib/screenshotone";
import { isExaConfigured, isTavilyConfigured } from "@/lib/web-search";
import { isNvidiaEnabled, isNvidiaModelId } from "@/lib/nvidia/client";
import { NVIDIA_MODELS } from "@/lib/nvidia/models";

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

export { NVIDIA_MODELS, isNvidiaModelId };
