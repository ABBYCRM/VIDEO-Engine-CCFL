import { isIP } from "node:net";
import Steel from "steel-sdk";

const DEFAULT_TIMEOUT_MS = 45_000;
const MAX_DELAY_MS = 10_000;
const MAX_MARKDOWN_CHARS = 12_000;
const MAX_LINKS = 30;

function getSteelApiKey(): string {
  const key = process.env.STEEL_API_KEY?.trim();
  if (!key) throw new Error("Steel is not configured. Set STEEL_API_KEY on the server.");
  return key;
}

export function isSteelConfigured(): boolean {
  return Boolean(process.env.STEEL_API_KEY?.trim());
}

function isBlockedIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224;
}

function isBlockedIpv6(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  const first = Number.parseInt(normalized.split(":")[0] || "0", 16);
  if (first >= 0xfe80 && first <= 0xfebf) return true;
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? isBlockedIpv4(mapped[1]) : false;
}

export function validateSteelUrl(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) throw new Error("url is required");
  let url: URL;
  try { url = new URL(raw); }
  catch { throw new Error("url must be an absolute http(s) URL"); }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("url must use http or https");
  if (url.username || url.password) throw new Error("url must not contain credentials");

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new Error("local and private hosts are not allowed");
  }
  const ipVersion = isIP(hostname.replace(/^\[|\]$/g, ""));
  if ((ipVersion === 4 && isBlockedIpv4(hostname)) || (ipVersion === 6 && isBlockedIpv6(hostname))) {
    throw new Error("local and private IP addresses are not allowed");
  }
  return url.toString();
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
