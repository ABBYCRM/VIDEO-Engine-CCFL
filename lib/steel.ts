import Steel from "steel-sdk";
import { db } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { validateSteelUrl } from "@/lib/steel-url";

const DEFAULT_TIMEOUT_MS = 45_000;
const MAX_DELAY_MS = 10_000;
const MAX_MARKDOWN_CHARS = 12_000;
const MAX_LINKS = 30;
const STEEL_KEY_SETTING = "steel_api_key";

function getRaw(key: string): string | null {
  return (db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined)?.value ?? null;
}

// Same encrypted-in-settings-with-env-fallback pattern as every other
// provider key in this app (Hedra/Gemini/xAI/A2E/NVIDIA/Composio) — Steel
// previously only read process.env.STEEL_API_KEY, which meant the operator
// could never set it without an env var change + redeploy.
function getSteelApiKey(): string {
  const encrypted = getRaw(STEEL_KEY_SETTING);
  if (encrypted) return decryptSecret(encrypted);
  const key = process.env.STEEL_API_KEY?.trim();
  if (!key) throw new Error("Steel is not configured. Save a Steel.dev API key in Settings, or set STEEL_API_KEY on the server.");
  return key;
}

export function saveSteelApiKey(value: string) {
  db.prepare("INSERT INTO settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").run(STEEL_KEY_SETTING, encryptSecret(value.trim()));
}

export function isSteelConfigured(): boolean {
  return Boolean(getRaw(STEEL_KEY_SETTING) || process.env.STEEL_API_KEY?.trim());
}

function getSteelClient(): Steel {
  return new Steel({
    steelAPIKey: getSteelApiKey(),
    baseURL: process.env.STEEL_BASE_URL?.trim() || undefined,
    timeout: DEFAULT_TIMEOUT_MS,
    maxRetries: 1
  });
}

export async function scrapeWithSteel(input: {
  url: unknown;
  delayMs?: unknown;
  useProxy?: unknown;
  screenshot?: unknown;
}) {
  const url = validateSteelUrl(input.url);
  const parsedDelay = Number(input.delayMs ?? 0);
  const delay = Number.isFinite(parsedDelay) ? Math.max(0, Math.min(MAX_DELAY_MS, Math.trunc(parsedDelay))) : 0;
  const result = await getSteelClient().scrape({
    url,
    format: ["markdown"],
    delay,
    useProxy: input.useProxy === true,
    screenshot: input.screenshot === true
  });
  const markdown = result.content.markdown ?? "";
  return {
    via: "steel.dev",
    url: result.metadata.canonical || result.metadata.urlSource || url,
    statusCode: result.metadata.statusCode,
    title: result.metadata.title || null,
    description: result.metadata.description || null,
    markdown: markdown.slice(0, MAX_MARKDOWN_CHARS),
    truncated: markdown.length > MAX_MARKDOWN_CHARS,
    screenshotUrl: result.screenshot?.url || null,
    links: result.links.slice(0, MAX_LINKS).map((link) => ({ text: link.text, url: link.url }))
  };
}
