import { db } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { PROVIDERS, type ProviderId } from "@/lib/providers";
import { isNvidiaModelId } from "@/lib/nvidia";
import { COMPOSIO_TOOLKITS, isComposioConfigured, getAuthConfigId } from "@/lib/composio/client";
import { isImageProviderConfigured, getImageProvider, getImageModel, type ImageProvider } from "@/lib/avatar-generation/client";
import { isInstagramConfigured } from "@/lib/instagram-graph";
import { isSteelConfigured } from "@/lib/steel";
import { isFirecrawlConfigured } from "@/lib/firecrawl";
import { isScrapingBeeConfigured } from "@/lib/scrapingbee";
import { isScrapflyConfigured } from "@/lib/scrapfly";
import { isScreenshotOneConfigured } from "@/lib/screenshotone";
import { isExaConfigured, isTavilyConfigured } from "@/lib/web-search";
import { isHeliconeEnabled } from "@/lib/nvidia/helicone";
import { isE2bConfigured } from "@/lib/coding-agent/e2b-backend";

export type EngineSettings = {
  defaultProvider: ProviderId;
  providers: {
    veo: { keyConfigured: boolean; model: string };
    grok: { keyConfigured: boolean; model: string };
    a2e: { keyConfigured: boolean; model: string };
    hedra: { keyConfigured: boolean; model: string };
  };
  nvidia: { keyConfigured: boolean; model: string };
  composio: { keyConfigured: boolean; toolkits: Array<{ id: string; authConfigConfigured: boolean }> };
  instagram: { configured: boolean };
  steel: { configured: boolean };
  research: {
    firecrawl: boolean;
    scrapingbee: boolean;
    scrapfly: boolean;
    screenshotone: boolean;
    exa: boolean;
    tavily: boolean;
    heliconeEnabled: boolean;
    e2b: boolean;
  };
  image: { configured: boolean; provider: ImageProvider; model: string };
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

export function getGeminiApiKey(): string {
  const encrypted = getRaw("gemini_api_key");
  if (encrypted) return decryptSecret(encrypted);
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  throw new Error("Gemini API key is not configured");
}
export function saveGeminiApiKey(value: string) { setRaw("gemini_api_key", encryptSecret(value.trim())); }
export function saveXaiApiKey(value: string) { setRaw("xai_api_key", encryptSecret(value.trim())); }
export function saveA2eApiKey(value: string) { setRaw("a2e_api_key", encryptSecret(value.trim())); }
export function saveHedraApiKey(value: string) { setRaw("hedra_api_key", encryptSecret(value.trim())); }
export function saveNvidiaApiKey(value: string) { setRaw("nvidia_api_key", encryptSecret(value.trim())); }

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
      hedra: { keyConfigured: providerConfigured("hedra"), model: getRaw("hedra_model") || PROVIDERS.hedra.defaultModel }
    },
    nvidia: {
      keyConfigured: Boolean(getRaw("nvidia_api_key") || process.env.NVIDIA_API_KEY),
      // Default to the live 2026-08-27 catalog default. The model registry is
      // the source of truth — the old 3.1 70B was retired 2026-08-26.
      model: getRaw("nvidia_model") || "meta/llama-3.2-11b-vision-instruct"
    },
    composio: {
      keyConfigured: isComposioConfigured(),
      toolkits: COMPOSIO_TOOLKITS.map(t => ({ id: t.id, authConfigConfigured: Boolean(getAuthConfigId(t.id)) }))
    },
    instagram: { configured: isInstagramConfigured() },
    steel: { configured: isSteelConfigured() },
    research: {
      firecrawl: isFirecrawlConfigured(),
      scrapingbee: isScrapingBeeConfigured(),
      scrapfly: isScrapflyConfigured(),
      screenshotone: isScreenshotOneConfigured(),
      exa: isExaConfigured(),
      tavily: isTavilyConfigured(),
      heliconeEnabled: isHeliconeEnabled(),
      e2b: isE2bConfigured()
    },
    image: getImageSettings(),
    resolution: ((getRaw("resolution") as EngineSettings["resolution"]) || "1080p"),
    aspectRatio: ((getRaw("aspect_ratio") as EngineSettings["aspectRatio"]) || "9:16")
  };
}

export type ImageSettings = { configured: boolean; provider: ImageProvider; model: string };
export function getImageSettings(): ImageSettings {
  return { configured: isImageProviderConfigured(), provider: getImageProvider(), model: getImageModel() };
}

export function saveEngineSettings(input: Partial<{
  defaultProvider: ProviderId;
  model: string;
  resolution: "720p" | "1080p" | "4k";
  aspectRatio: "9:16" | "16:9";
  veoModel: string;
  grokModel: string;
  a2eModel: string;
  hedraModel: string;
  nvidiaModel: string;
}>) {
  if (input.defaultProvider && isProviderId(input.defaultProvider)) setRaw("default_provider", input.defaultProvider);
  if (input.resolution) setRaw("resolution", input.resolution);
  if (input.aspectRatio) setRaw("aspect_ratio", input.aspectRatio);
  if (input.model) setRaw("veo_model", input.model);
  if (input.veoModel) setRaw("veo_model", input.veoModel);
  if (input.grokModel) setRaw("grok_model", input.grokModel);
  if (input.a2eModel) setRaw("a2e_model", input.a2eModel);
  if (input.hedraModel) setRaw("hedra_model", input.hedraModel);
  if (input.nvidiaModel && isNvidiaModelId(input.nvidiaModel)) setRaw("nvidia_model", input.nvidiaModel);
}


/* === LANGUAGE SETTINGS === */
export type LanguageSetting = "english" | "spanish" | "mixed";

export function getLanguageSetting(): LanguageSetting {
  const raw = (db.prepare("SELECT value FROM settings WHERE key = ?").get("content_language") as { value: string } | undefined)?.value;
  if (raw === "spanish" || raw === "mixed") return raw;
  return "english";
}

export function saveLanguageSetting(lang: LanguageSetting) {
  db.prepare("INSERT INTO settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").run("content_language", lang);
}
