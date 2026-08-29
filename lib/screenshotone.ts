// ScreenshotOne (screenshotone.com) — a genuinely different capability
// from Steel/Firecrawl/ScrapingBee/Scrapfly: it takes a screenshot of a
// URL, it doesn't scrape content. Separate Claw tool (ig_... no —
// web_screenshot), not folded into the steel_scrape fallback chain.
//
// API verified with a real request during this integration (2026-08-29):
// GET https://api.screenshotone.com/take?access_key=...&url=...&signature=...
// Signing is optional per ScreenshotOne's own docs (only needed to stop
// tampering when a screenshot URL is embedded in a public <img> src — not
// our case, this is a server-to-server call) but cheap and safer to do
// anyway since both keys were provided: HMAC-SHA256 the exact query
// string (access_key + url, unsorted, matching the order sent) with the
// secret key, hex-encode, append as &signature=. Response is the raw
// image binary (confirmed: a real JPEG came back, content-type image/jpeg).
//
// The image is persisted the same way every other generated image in
// this app is (lib/media-library.ts's saveGeneratedImage) so it gets a
// real /generated/images/... URL Claw can hand back to the operator,
// with createCalendarPost:false — a research screenshot isn't campaign
// content and shouldn't appear in the Calendar queue.

import crypto from "node:crypto";
import { db } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { validateSteelUrl } from "@/lib/steel-url";
import { saveGeneratedImage } from "@/lib/media-library";

const ACCESS_KEY_SETTING = "screenshotone_access_key";
const SECRET_KEY_SETTING = "screenshotone_secret_key";
const TIMEOUT_MS = 30_000;

function getRaw(key: string): string | null {
  return (db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined)?.value ?? null;
}

function getAccessKey(): string {
  const encrypted = getRaw(ACCESS_KEY_SETTING);
  if (encrypted) return decryptSecret(encrypted);
  const key = process.env.SCREENSHOTONE_ACCESS_KEY?.trim();
  if (!key) throw new Error("ScreenshotOne is not configured. Save an access key in Settings, or set SCREENSHOTONE_ACCESS_KEY on the server.");
  return key;
}

function getSecretKey(): string | null {
  const encrypted = getRaw(SECRET_KEY_SETTING);
  if (encrypted) return decryptSecret(encrypted);
  return process.env.SCREENSHOTONE_SECRET_KEY?.trim() || null;
}

export function saveScreenshotOneCredentials(input: { accessKey?: string; secretKey?: string }) {
  if (input.accessKey) db.prepare("INSERT INTO settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").run(ACCESS_KEY_SETTING, encryptSecret(input.accessKey.trim()));
  if (input.secretKey) db.prepare("INSERT INTO settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").run(SECRET_KEY_SETTING, encryptSecret(input.secretKey.trim()));
}

export function isScreenshotOneConfigured(): boolean {
  return Boolean(getRaw(ACCESS_KEY_SETTING) || process.env.SCREENSHOTONE_ACCESS_KEY?.trim());
}

export async function takeScreenshot(input: { url: unknown; fullPage?: unknown }) {
  const url = validateSteelUrl(input.url);
  const accessKey = getAccessKey();
  const secretKey = getSecretKey();
  const params = new URLSearchParams({ access_key: accessKey, url, format: "jpg" });
  if (input.fullPage === true) params.set("full_page", "true");
  if (secretKey) {
    const signature = crypto.createHmac("sha256", secretKey).update(params.toString()).digest("hex");
    params.set("signature", signature);
  }
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`https://api.screenshotone.com/take?${params.toString()}`, { signal: ac.signal, cache: "no-store" });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`ScreenshotOne HTTP ${res.status}: ${text.slice(0, 300)}`);
    }
    const bytes = Buffer.from(await res.arrayBuffer());
    const saved = await saveGeneratedImage({
      base64: bytes.toString("base64"),
      source: "screenshotone",
      prompt: url,
      mimeType: "image/jpeg",
      createCalendarPost: false
    });
    return { via: "screenshotone", url, screenshotUrl: saved.url };
  } finally {
    clearTimeout(timer);
  }
}
