import type { ForgeCreateInput, ForgeHandoffReason, StealthMode } from "./types";

export const FORGE_MAX_SESSIONS = Number(process.env.FORGE_MAX_SESSIONS) || 2;
export const FORGE_MAX_DELAY_MS = 10_000;
export const FORGE_MAX_MARKDOWN = 12_000;
export const FORGE_MAX_LINKS = 30;
export const DEFAULT_VIEWPORT = { width: 1280, height: 800 };

const PRIVATE_HOST =
  /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)$/i;

const BLOCKED_OPS = new Set([
  "solve_captcha",
  "inject_token",
  "captcha_farm",
  "rotate_proxies",
  "residential_rotate",
]);

export function parseStealth(value: unknown): StealthMode {
  if (value === "off" || value === "lab" || value === "coherence") return value;
  return "coherence";
}

export function parseCreateInput(raw: unknown): ForgeCreateInput {
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const width = Number(input.width ?? input.w ?? DEFAULT_VIEWPORT.width);
  const height = Number(input.height ?? input.h ?? DEFAULT_VIEWPORT.height);
  return {
    width: Number.isFinite(width) ? Math.min(1920, Math.max(800, Math.trunc(width))) : DEFAULT_VIEWPORT.width,
    height: Number.isFinite(height) ? Math.min(1200, Math.max(600, Math.trunc(height))) : DEFAULT_VIEWPORT.height,
    stealth: parseStealth(input.stealth),
    persist: input.persist !== false,
    blockAds: input.blockAds === true || input.block_ads === true,
  };
}

export function evaluateForgeOp(
  op: string,
  extra?: { url?: unknown; solveCaptcha?: unknown; proxyRotate?: unknown },
): { ok: true } | { ok: false; error: string } {
  const name = String(op || "").trim();
  if (!name) return { ok: false, error: "op is required" };
  if (BLOCKED_OPS.has(name) || extra?.solveCaptcha === true) {
    return {
      ok: false,
      error: "Forge does not solve, farm, or inject CAPTCHA tokens. Hand the same session to a human.",
    };
  }
  if (extra?.proxyRotate === true) {
    return { ok: false, error: "Residential proxy rotation is not provided." };
  }
  return { ok: true };
}

export function guardPublicUrl(
  raw: unknown,
  opts?: { allowPreviewFixtures?: boolean },
): { ok: true; url: string } | { ok: false; error: string } {
  const value = String(raw ?? "").trim();
  if (!value) return { ok: false, error: "url is required" };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, error: "Invalid URL" };
  }
  if (!/^https?:$/.test(url.protocol)) return { ok: false, error: "Only http(s) URLs are allowed" };
  const host = url.hostname;
  const isLoopback = host === "localhost" || host === "127.0.0.1";
  if ((opts?.allowPreviewFixtures ?? true) && isLoopback && url.pathname.startsWith("/fixtures/")) {
    return { ok: true, url: url.toString() };
  }
  if (PRIVATE_HOST.test(host) || host.endsWith(".local") || host.endsWith(".internal")) {
    return { ok: false, error: "Private and local network targets are blocked" };
  }
  if (host === "169.254.169.254" || host === "metadata.google.internal") {
    return { ok: false, error: "Cloud metadata endpoints are blocked" };
  }
  return { ok: true, url: url.toString() };
}

export function clampDelay(raw: unknown): number {
  const n = Number(raw ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(FORGE_MAX_DELAY_MS, Math.trunc(n)));
}

const CAPTCHA_MARKERS = [
  "recaptcha",
  "hcaptcha",
  "cf-turnstile",
  "captcha",
  "verify you are human",
  "i'm not a robot",
  "are you a robot",
  "unusual traffic",
  "select all squares",
];

export function detectForgeHandoff(input: {
  url: string;
  title: string;
  bodyText: string;
}): ForgeHandoffReason[] {
  const blob = `${input.url} ${input.title} ${input.bodyText}`.toLowerCase();
  const hits: ForgeHandoffReason[] = [];
  if (CAPTCHA_MARKERS.some((m) => blob.includes(m))) {
    const negated = /not a captcha|isn't a captcha|is not a captcha|not a third-party challenge/.test(blob);
    if (!negated || /recaptcha|hcaptcha|cf-turnstile|select all squares|unusual traffic|i'm not a robot/.test(blob)) {
      hits.push("captcha");
    }
  }
  if (/\b(one[- ]time (code|password)|verification code|authenticator)\b/.test(blob)) hits.push("mfa");
  if (/\bpassword\b/.test(blob) && /\b(sign in|log in|login)\b/.test(blob)) hits.push("password");
  if (/\b(credit card|card number|cvv|pay now)\b/.test(blob)) hits.push("payment");
  return [...new Set(hits)];
}

export const AD_HOST =
  /doubleclick|googlesyndication|adservice|adsystem|facebook\.net\/tr|googletagmanager|scorecardresearch|ads-twitter/i;
