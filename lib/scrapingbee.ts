// ScrapingBee — second scrape fallback behind Steel/Firecrawl for Claw's
// steel_scrape tool. Same DB-encrypted-with-env-fallback key pattern, same
// SSRF guard (validateSteelUrl) applied before any outbound request.
//
// API verified with a real request during this integration (2026-08-29),
// not just docs: GET https://app.scrapingbee.com/api/v1?url=...&return_page_markdown=true
// with Authorization: Bearer <key>. With return_page_markdown=true and no
// json_response flag, the raw response BODY is the markdown text directly
// (confirmed: Content-Type says application/json but the body is plain
// markdown) — not a JSON envelope. Useful metadata rides on response
// headers instead: Spb-resolved-url (final URL after redirects) and
// Spb-initial-status-code (the target page's real HTTP status).

import { db } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { validateSteelUrl } from "@/lib/steel-url";

const KEY_SETTING = "scrapingbee_api_key";
const MAX_MARKDOWN_CHARS = 12_000;
const TIMEOUT_MS = 45_000;

function getRaw(key: string): string | null {
  return (db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined)?.value ?? null;
}

function getScrapingBeeApiKey(): string {
  const encrypted = getRaw(KEY_SETTING);
  if (encrypted) return decryptSecret(encrypted);
  const key = process.env.SCRAPINGBEE_API_KEY?.trim();
  if (!key) throw new Error("ScrapingBee is not configured. Save a ScrapingBee API key in Settings, or set SCRAPINGBEE_API_KEY on the server.");
  return key;
}

export function saveScrapingBeeApiKey(value: string) {
  db.prepare("INSERT INTO settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").run(KEY_SETTING, encryptSecret(value.trim()));
}

export function isScrapingBeeConfigured(): boolean {
  return Boolean(getRaw(KEY_SETTING) || process.env.SCRAPINGBEE_API_KEY?.trim());
}

export async function scrapeWithScrapingBee(input: { url: unknown }) {
  const url = validateSteelUrl(input.url);
  const target = new URL("https://app.scrapingbee.com/api/v1");
  target.searchParams.set("url", url);
  target.searchParams.set("return_page_markdown", "true");
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(target.toString(), {
      headers: { Authorization: `Bearer ${getScrapingBeeApiKey()}` },
      signal: ac.signal,
      cache: "no-store"
    });
    const markdown = await res.text();
    if (!res.ok) throw new Error(`ScrapingBee HTTP ${res.status}: ${markdown.slice(0, 300)}`);
    const statusCode = Number(res.headers.get("Spb-initial-status-code")) || res.status;
    const resolvedUrl = res.headers.get("Spb-resolved-url") || url;
    return {
      via: "scrapingbee",
      url: resolvedUrl,
      statusCode,
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
