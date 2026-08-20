import { db } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

export type EngineSettings = {
  geminiKeyConfigured: boolean;
  model: string;
  resolution: "720p" | "1080p" | "4k";
  aspectRatio: "9:16" | "16:9";
};

function getRaw(key: string): string | null {
  return (db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined)?.value ?? null;
}
function setRaw(key: string, value: string) {
  db.prepare("INSERT INTO settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").run(key, value);
}
export function getGeminiApiKey(): string {
  const encrypted = getRaw("gemini_api_key");
  if (encrypted) return decryptSecret(encrypted);
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  throw new Error("Gemini API key is not configured");
}
export function saveGeminiApiKey(value: string) { setRaw("gemini_api_key", encryptSecret(value.trim())); }
export function getEngineSettings(): EngineSettings {
  return {
    geminiKeyConfigured: Boolean(getRaw("gemini_api_key") || process.env.GEMINI_API_KEY),
    model: getRaw("model") || "veo-3.1-generate-preview",
    resolution: (getRaw("resolution") as EngineSettings["resolution"]) || "1080p",
    aspectRatio: (getRaw("aspect_ratio") as EngineSettings["aspectRatio"]) || "9:16"
  };
}
export function saveEngineSettings(input: Partial<Pick<EngineSettings, "model" | "resolution" | "aspectRatio">>) {
  if (input.model) setRaw("model", input.model);
  if (input.resolution) setRaw("resolution", input.resolution);
  if (input.aspectRatio) setRaw("aspect_ratio", input.aspectRatio);
}
