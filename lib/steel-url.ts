// Pure, dependency-free SSRF guard for Steel.dev target URLs — no db/crypto
// imports, so this stays unit-testable under plain `node --test` (no
// loader for this repo's "@/" path aliases or extensionless relative
// imports). lib/steel.ts imports and re-exports validateSteelUrl from here;
// this file is the one tests/unit/steel.test.ts imports directly.

import { isIP } from "node:net";

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
