// Firecrawl (firecrawl.dev) — one of three scrape fallbacks behind Steel
// (lib/steel.ts) for Claw's steel_scrape tool. Same DB-encrypted-with-
// env-fallback key pattern as every other provider here, and the same
// SSRF guard (validateSteelUrl) applied before any outbound request.
//
// API verified against Firecrawl's own docs (docs.firecrawl.dev, 2026-08-29):
// POST https://api.firecrawl.dev/v2/scrape, Authorization: Bearer <key>,
// body {url, formats:["markdown"]}, response {success, data:{markdown,
// metadata:{title,description,url}, links}}.

import { db } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { validateSteelUrl } from "@/lib/steel-url";

const KEY_SETTING = "firecrawl_api_key";
const MAX_MARKDOWN_CHARS = 12_000;
const MAX_LINKS = 30;
const TIMEOUT_MS = 45_000;

function getRaw(key: string): string | null {
  return (db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined)?.value ?? null;
}

function getFirecrawlApiKey(): string {
  const encrypted = getRaw(KEY_SETTING);
  if (encrypted) return decryptSecret(encrypted);
  const key = process.env.FIRECRAWL_API_KEY?.trim();
  if (!key) throw new Error("Firecrawl is not configured. Save a Firecrawl API key in Settings, or set FIRECRAWL_API_KEY on the server.");
  return key;
}

export function saveFirecrawlApiKey(value: string) {
  db.prepare("INSERT INTO settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").run(KEY_SETTING, encryptSecret(value.trim()));
}

export function isFirecrawlConfigured(): boolean {
  return Boolean(getRaw(KEY_SETTING) || process.env.FIRECRAWL_API_KEY?.trim());
}

export async function scrapeWithFirecrawl(input: { url: unknown }) {
  const url = validateSteelUrl(input.url);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: { Authorization: `Bearer ${getFirecrawlApiKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, formats: ["markdown", "links"] }),
      signal: ac.signal,
      cache: "no-store"
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body?.success === false) {
      throw new Error(`Firecrawl HTTP ${res.status}: ${String(body?.error || JSON.stringify(body)).slice(0, 300)}`);
    }
    const data = body?.data || {};
    const markdown = String(data.markdown || "");
    const links: string[] = Array.isArray(data.links) ? data.links : [];
    return {
      via: "firecrawl",
      url: data.metadata?.url || data.metadata?.sourceURL || url,
      statusCode: data.metadata?.statusCode ?? 200,
      title: data.metadata?.title || null,
      description: data.metadata?.description || null,
      markdown: markdown.slice(0, MAX_MARKDOWN_CHARS),
      truncated: markdown.length > MAX_MARKDOWN_CHARS,
      screenshotUrl: null,
      links: links.slice(0, MAX_LINKS).map((href) => ({ text: href, url: href }))
    };
  } finally {
    clearTimeout(timer);
  }
}
