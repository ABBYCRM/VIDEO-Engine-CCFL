import type { ComputerAction, HandoffReason, PolicyDecision } from "./types";

const PRIVATE_HOST =
  /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)$/i;

const CAPTCHA_MARKERS = [
  "recaptcha",
  "hcaptcha",
  "cf-turnstile",
  "captcha",
  "verify you are human",
  "i'm not a robot",
  "are you a robot",
  "unusual traffic",
];

export function isSafePublicUrl(
  raw: string,
  opts?: { allowPreviewFixtures?: boolean },
): { ok: true; url: URL } | { ok: false; error: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: "Invalid URL" };
  }
  if (!/^https?:$/.test(url.protocol)) return { ok: false, error: "Only http(s) URLs are allowed" };

  const host = url.hostname;
  const isLoopback = host === "localhost" || host === "127.0.0.1";
  if (opts?.allowPreviewFixtures && isLoopback && url.pathname.startsWith("/fixtures/")) {
    return { ok: true, url };
  }
  if (PRIVATE_HOST.test(host) || host.endsWith(".local") || host.endsWith(".internal")) {
    return { ok: false, error: "Private and local network targets are blocked" };
  }
  if (host === "169.254.169.254" || host === "metadata.google.internal") {
    return { ok: false, error: "Cloud metadata endpoints are blocked" };
  }
  return { ok: true, url };
}

export function safeSessionFilename(raw: string | undefined): { ok: true; name: string } | { ok: false; error: string } {
  const name = (raw ?? "").trim();
  if (!name) return { ok: false, error: "filename is required" };
  if (name.includes("/") || name.includes("\\") || name.includes("..") || name.includes("\0")) {
    return { ok: false, error: "Only a session-scoped file name is allowed" };
  }
  if (!/^[\w.\- ]{1,120}$/.test(name)) return { ok: false, error: "Illegal file name" };
  return { ok: true, name };
}

export function detectHandoffFromText(text: string): HandoffReason[] {
  const lower = text.toLowerCase();
  const hits: HandoffReason[] = [];
  if (CAPTCHA_MARKERS.some((m) => lower.includes(m))) hits.push("captcha");
  if (/\b(one[- ]time (code|password)|verification code|authenticator|enter the code)\b/.test(lower)) {
    hits.push("mfa");
  }
  if (/\b(password|passcode)\b/.test(lower) && /\b(sign in|log in|login)\b/.test(lower)) {
    hits.push("password");
  }
  if (/\b(credit card|card number|cvv|payment method|pay now)\b/.test(lower)) hits.push("payment");
  return [...new Set(hits)];
}

export function evaluateAction(action: ComputerAction): {
  decision: PolicyDecision;
  reason?: HandoffReason;
  error?: string;
} {
  switch (action.type) {
    case "screenshot":
    case "wait":
    case "move":
    case "scroll":
    case "handoff":
    case "resume":
    case "download":
      return { decision: "ALLOW" };
    case "click":
    case "double_click":
    case "drag":
      if (action.type === "click" && (action.text?.trim() || action.selector)) return { decision: "ALLOW" };
      if (action.x == null || action.y == null) return { decision: "DENY", error: "Click requires x and y, or a text label" };
      return { decision: "ALLOW" };
    case "navigate": {
      if (!action.url) return { decision: "DENY", error: "navigate requires url" };
      const safe = isSafePublicUrl(action.url, { allowPreviewFixtures: true });
      if (!safe.ok) return { decision: "DENY", error: safe.error };
      return { decision: "ALLOW" };
    }
    case "search":
      if (!action.text?.trim()) return { decision: "DENY", error: "search requires text" };
      return { decision: "ALLOW" };
    case "type":
    case "fill": {
      const text = action.text ?? "";
      if (!text) return { decision: "DENY", error: "text is required" };
      if (looksLikeSecret(text)) return { decision: "HUMAN_REQUIRED", reason: "password" };
      return { decision: "ALLOW" };
    }
    case "upload": {
      const file = safeSessionFilename(action.filename);
      if (!file.ok) return { decision: "DENY", error: file.error };
      return { decision: "ALLOW" };
    }
    case "keypress":
      return { decision: "ALLOW" };
    default:
      return { decision: "DENY", error: "Unknown action" };
  }
}

function looksLikeSecret(text: string): boolean {
  if (/^(otp|2fa|mfa)[:\s]/i.test(text)) return true;
  if (/password\s*[:=]/i.test(text)) return true;
  if (/^\d{6}$/.test(text.trim())) return true;
  return false;
}

export function classifyPageForHandoff(input: {
  url: string;
  title: string;
  bodyText: string;
  passwordFieldVisible: boolean;
  captchaFrame: boolean;
}): HandoffReason[] {
  const reasons = detectHandoffFromText(`${input.title}\n${input.bodyText}`);
  if (input.passwordFieldVisible) reasons.push("password");
  if (input.captchaFrame) reasons.push("captcha");
  return [...new Set(reasons)];
}
