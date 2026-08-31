// lib/screenshotone.ts — Claw-only.
//
// 2026-08-30 "Claw only" repo strip. The previous build of this file
// persisted screenshots through lib/media-library's saveGeneratedImage
// so they appeared in the Library. With Library gone, the response is
// just the raw base64 + mime — Claw returns it inline and the operator
// can copy it out of the chat.
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { validateSteelUrl } from "@/lib/steel-url";

const ACCESS_KEY_SETTING = "screenshotone_access_key";
const SECRET_KEY_SETTING = "screenshotone_secret_key";
const TIMEOUT_MS = 30_000;

function setRaw(key: string, value: string) {
  db.prepare(
    "INSERT INTO settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP"
  ).run(key, value);
}

export function saveScreenshotOneCredentials(input: { accessKey?: string; secretKey?: string }) {
  if (input.accessKey) setRaw(ACCESS_KEY_SETTING, encryptSecret(input.accessKey.trim()));
  if (input.secretKey) setRaw(SECRET_KEY_SETTING, encryptSecret(input.secretKey.trim()));
}

function getRaw(key: string): string | null {
  const v = db.prepare("SELECT value FROM settings WHERE key=?").get(key) as { value: string } | undefined;
  if (!v) return null;
  try { return decryptSecret(v.value); } catch { return v.value; }
}

function getKeys() {
  return {
    accessKey: process.env.SCREENSHOTONE_ACCESS_KEY || getRaw(ACCESS_KEY_SETTING) || "",
    secretKey: process.env.SCREENSHOTONE_SECRET_KEY || getRaw(SECRET_KEY_SETTING) || ""
  };
}

export function isScreenshotOneConfigured(): boolean {
  const k = getKeys();
  return Boolean(k.accessKey);
}

export async function takeScreenshot(input: { url: unknown; fullPage?: unknown; delayMs?: unknown; useProxy?: unknown; screenshot?: unknown }): Promise<{ url: string; mime: string; base64: string; bytes: number }> {
  const url = validateSteelUrl(input.url);
  const k = getKeys();
  if (!k.accessKey) throw new Error("ScreenshotOne is not configured. Set SCREENSHOTONE_ACCESS_KEY env or save it under the screenshotone_access_key setting.");
  const fullPage = Boolean(input.fullPage);
  const params: Record<string, string | number | boolean> = {
    access_key: k.accessKey,
    url,
    full_page: fullPage,
    format: "png"
  };
  let query = Object.entries(params).map(([k2, v]) => `${encodeURIComponent(k2)}=${encodeURIComponent(String(v))}`).join("&");
  if (k.secretKey) {
    const sig = crypto.createHmac("sha256", k.secretKey).update(query).digest("hex");
    query += `&signature=${sig}`;
  }
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(`https://api.screenshotone.com/take?${query}`, { signal: ac.signal, cache: "no-store" });
    if (!r.ok) throw new Error(`ScreenshotOne HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const mime = r.headers.get("content-type") || "image/png";
    const bytes = new Uint8Array(await r.arrayBuffer());
    return { url, mime, base64: Buffer.from(bytes).toString("base64"), bytes: bytes.byteLength };
  } finally { clearTimeout(timer); }
}
