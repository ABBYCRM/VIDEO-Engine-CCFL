// Scrapfly — third scrape fallback behind Steel/Firecrawl/ScrapingBee for
// Claw's steel_scrape tool. Same DB-encrypted-with-env-fallback key
// pattern, same SSRF guard (validateSteelUrl) applied before any outbound
// request.
//
// API verified with a real request during this integration (2026-08-29):
// GET https://api.scrapfly.io/scrape?key=<key>&url=...&format=markdown.
// Response is {result:{content,status_code,success,url,...}} — content is
// the markdown text directly. No title field is exposed for markdown
// format (unlike Steel/Firecrawl), so title/description stay null here —
// acceptable since this is the last fallback in the chain.

import { db } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { validateSteelUrl } from "@/lib/steel-url";

const KEY_SETTING = "scrapfly_api_key";
const MAX_MARKDOWN_CHARS = 12_000;
const TIMEOUT_MS = 45_000;

function getRaw(key: string): string | null {
  return (db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined)?.value ?? null;
}

function getScrapflyApiKey(): string {
  const encrypted = getRaw(KEY_SETTING);
  if (encrypted) return decryptSecret(encrypted);
  const key = process.env.SCRAPFLY_API_KEY?.trim();
  if (!key) throw new Error("Scrapfly is not configured. Save a Scrapfly API key in Settings, or set SCRAPFLY_API_KEY on the server.");
  return key;
}

export function saveScrapflyApiKey(value: string) {
  db.prepare("INSERT INTO settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").run(KEY_SETTING, encryptSecret(value.trim()));
}

export function isScrapflyConfigured(): boolean {
  return Boolean(getRaw(KEY_SETTING) || process.env.SCRAPFLY_API_KEY?.trim());
}

export async function scrapeWithScrapfly(input: { url: unknown }) {
  const url = validateSteelUrl(input.url);
  const target = new URL("https://api.scrapfly.io/scrape");
  target.searchParams.set("key", getScrapflyApiKey());
  target.searchParams.set("url", url);
  target.searchParams.set("format", "markdown");
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(target.toString(), { signal: ac.signal, cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    const result = body?.result || {};
    if (!res.ok || result.success === false) {
      throw new Error(`Scrapfly HTTP ${res.status}: ${String(result.error || body?.message || JSON.stringify(body)).slice(0, 300)}`);
    }
    const markdown = String(result.content || "");
    return {
      via: "scrapfly",
      url: result.url || url,
      statusCode: result.status_code ?? res.status,
      title: null,
      description: null,
      markdown: markdown.slice(0, MAX_MARKDOWN_CHARS),
      truncated: markdown.length > MAX_MARKDOWN_CHARS,
      screenshotUrl: null,
      links: [] as { text: string; url: string }[]
    };
  } finally {
    clearTimeout(timer);
  }
}
