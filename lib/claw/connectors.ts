// Soft-fail connectors for Claw tools. Keys stay server-side.
// Missing or wrong-type credentials return { ok:false, error, hint } — never throw a raw key.

import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { validateSteelUrl } from "@/lib/steel-url";
import { isHeliconeEnabled } from "@/lib/nvidia/helicone";
import { isGdyConfigured } from "@/lib/claw/gdy";
import { classifyComposioKey, composioKeyHint } from "@/lib/composio/consumer";
import { isComposioConfigured, getComposioApiKey } from "@/lib/composio/client";

const TIMEOUT = 25_000;

function getRaw(key: string): string | null {
  try {
    return (db.prepare("SELECT value FROM settings WHERE key=?").get(key) as { value: string } | undefined)?.value ?? null;
  } catch { return null; }
}

function secret(setting: string, envName: string): string {
  const encrypted = getRaw(setting);
  if (encrypted) {
    try { return decryptSecret(encrypted); } catch { /* fall through */ }
  }
  return process.env[envName]?.trim() || "";
}

export function missing(service: string, envName: string, when: string): { ok: false; error: string; code: string; hint: string } {
  return {
    ok: false,
    error: `${service} is not configured.`,
    code: "MISSING_KEY",
    hint: `Set ${envName} on the server (already expected on DigitalOcean) or save it in Settings. When to use: ${when}`
  };
}

async function timedFetch(url: string, init: RequestInit, ms = TIMEOUT): Promise<Response> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  const signal = init.signal ? AbortSignal.any([init.signal, ac.signal]) : ac.signal;
  try { return await fetch(url, { ...init, signal, cache: "no-store" }); }
  finally { clearTimeout(timer); }
}

function clipText(text: string, max = 12_000): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  return { text: text.slice(0, max), truncated: true };
}

export function connectorInventory() {
  let composio: { configured: boolean; keyType?: string; note?: string } = { configured: isComposioConfigured() };
  if (composio.configured) {
    try {
      const kind = classifyComposioKey(getComposioApiKey());
      composio = { configured: true, keyType: kind, note: composioKeyHint(kind) || undefined };
    } catch { composio = { configured: false }; }
  }
  return {
    steel: { configured: Boolean(secret("steel_api_key", "STEEL_API_KEY")), when: "One-shot public-web scrape (steel_scrape). Interactive browsing uses Claw Computer." },
    firecrawl: { configured: Boolean(secret("firecrawl_api_key", "FIRECRAWL_API_KEY")), when: "Scrape fallback when Steel fails; structured markdown." },
    scrapingbee: { configured: Boolean(secret("scrapingbee_api_key", "SCRAPINGBEE_API_KEY")), when: "HTML scrape fallback; JS-rendered pages." },
    scrapfly: { configured: Boolean(secret("scrapfly_api_key", "SCRAPFLY_API_KEY")), when: "Last scrape fallback; anti-bot pages." },
    screenshotone: { configured: Boolean(process.env.SCREENSHOTONE_ACCESS_KEY || getRaw("screenshotone_access_key")), when: "Signed page screenshots (web_screenshot)." },
    composio,
    exa: { configured: Boolean(secret("exa_api_key", "EXA_API_KEY")), when: "Primary web_search provider." },
    tavily: { configured: Boolean(secret("tavily_api_key", "TAVILY_API_KEY")), when: "web_search fallback." },
    helicone: { configured: Boolean(process.env.HELICONE_API_KEY || getRaw("helicone_api_key")), enabled: isHeliconeEnabled(), when: "NVIDIA observability proxy; opt-in via HELICONE_ENABLED." },
    e2b: { configured: Boolean(secret("e2b_api_key", "E2B_API_KEY")), when: "Run untrusted code in a hosted sandbox (e2b_run)." },
    hedra: { configured: Boolean(secret("hedra_api_key", "HEDRA_API_KEY")), when: "Hedra v3 status / image models. Does not start video jobs." },
    resend: { configured: Boolean(secret("resend_api_key", "RESEND_API_KEY")), when: "Transactional email (resend_send)." },
    github: { configured: Boolean(secret("github_personal_access_token", "GITHUB_PERSONAL_ACCESS_TOKEN")), when: "GitHub REST (github_request)." },
    nvidia: { configured: Boolean(process.env.BITDEER_API_KEY || process.env.BITDEER_API_KEYS || process.env.NVIDIA_API_KEY || process.env.NVIDIA_API_KEYS || getRaw("nvidia_api_key") || getRaw("nvidia_api_keys")), when: "Claw chat, vision, embed, rerank via Bitdeer." },
    aion: { configured: Boolean(process.env.AION_BASE_URL && process.env.AION_API_KEY), when: "Connected brain — prefer aion_execute for toolful work; aion_status / aion_consult stay advice-only." },
    gdy: { configured: isGdyConfigured(), when: "OSINT RAG (gdy_search, gdy_rag_context, gdy_categories, gdy_tools). Fail-soft if GDY_API_KEY is missing." },
    arxiv: { configured: true, when: "Public preprint search (arxiv_search). No key." }
  };
}

export async function scrapeFirecrawl(url: string) {
  const key = secret("firecrawl_api_key", "FIRECRAWL_API_KEY");
  if (!key) return missing("Firecrawl", "FIRECRAWL_API_KEY", "public URL markdown when Steel is down");
  const target = validateSteelUrl(url);
  const res = await timedFetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url: target, formats: ["markdown"] })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: `Firecrawl HTTP ${res.status}`, hint: String(body?.error || "").slice(0, 200) };
  const markdown = String(body?.data?.markdown || body?.markdown || "");
  const clipped = clipText(markdown);
  return { ok: true, via: "firecrawl", url: target, title: body?.data?.metadata?.title || null, markdown: clipped.text, truncated: clipped.truncated };
}

export async function scrapeScrapingBee(url: string) {
  const key = secret("scrapingbee_api_key", "SCRAPINGBEE_API_KEY");
  if (!key) return missing("ScrapingBee", "SCRAPINGBEE_API_KEY", "JS-rendered HTML fallback");
  const target = validateSteelUrl(url);
  const res = await timedFetch(`https://app.scrapingbee.com/api/v1/?api_key=${encodeURIComponent(key)}&url=${encodeURIComponent(target)}&render_js=false`, {});
  const text = await res.text();
  if (!res.ok) return { ok: false, error: `ScrapingBee HTTP ${res.status}`, hint: text.slice(0, 200) };
  const clipped = clipText(text);
  return { ok: true, via: "scrapingbee", url: target, markdown: clipped.text, truncated: clipped.truncated };
}

export async function scrapeScrapfly(url: string) {
  const key = secret("scrapfly_api_key", "SCRAPFLY_API_KEY");
  if (!key) return missing("Scrapfly", "SCRAPFLY_API_KEY", "anti-bot scrape fallback");
  const target = validateSteelUrl(url);
  const res = await timedFetch(`https://api.scrapfly.io/scrape?key=${encodeURIComponent(key)}&url=${encodeURIComponent(target)}&format=markdown`, {});
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: `Scrapfly HTTP ${res.status}`, hint: String(body?.message || body?.error || "").slice(0, 200) };
  const markdown = String(body?.result?.content || body?.result?.markdown || "");
  const clipped = clipText(markdown);
  return { ok: true, via: "scrapfly", url: target, markdown: clipped.text, truncated: clipped.truncated };
}

export async function e2bRun(input: { code?: string; language?: string; timeoutMs?: number }) {
  const key = secret("e2b_api_key", "E2B_API_KEY");
  if (!key) return missing("E2B", "E2B_API_KEY", "execute untrusted code in a hosted sandbox — never in this process");
  const code = String(input.code || "").trim();
  if (!code || code.length > 20_000) return { ok: false, error: "code must be 1–20,000 characters", code: "BAD_ARGS" };
  const language = String(input.language || "python").toLowerCase();
  try {
    const { Sandbox } = await import("e2b");
    const sandbox = await Sandbox.create({ apiKey: key, timeoutMs: Math.min(60_000, Math.max(5_000, Number(input.timeoutMs) || 20_000)) });
    try {
      const cmd = language === "javascript" || language === "js" || language === "node"
        ? `node -e ${JSON.stringify(code)}`
        : `python3 -c ${JSON.stringify(code)}`;
      const result = await sandbox.commands.run(cmd, { timeoutMs: Math.min(30_000, Number(input.timeoutMs) || 15_000) });
      return {
        ok: result.exitCode === 0,
        via: "e2b",
        exitCode: result.exitCode,
        stdout: String(result.stdout || "").slice(0, 6000),
        stderr: String(result.stderr || "").slice(0, 2000)
      };
    } finally {
      await sandbox.kill().catch(() => {});
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error), hint: "Check E2B_API_KEY and that the e2b package can reach api.e2b.dev." };
  }
}

export async function githubRequest(input: { method?: string; path?: string; body?: unknown }) {
  const token = secret("github_personal_access_token", "GITHUB_PERSONAL_ACCESS_TOKEN");
  if (!token) return missing("GitHub", "GITHUB_PERSONAL_ACCESS_TOKEN", "read/write GitHub REST for the operator account");
  const method = String(input.method || "GET").toUpperCase();
  if (!["GET", "POST", "PATCH", "PUT"].includes(method)) return { ok: false, error: "method must be GET, POST, PATCH, or PUT" };
  const path = String(input.path || "").trim();
  if (!path.startsWith("/")) return { ok: false, error: "path must start with / (e.g. /repos/owner/name)" };
  if (path.includes("..") || path.includes("://")) return { ok: false, error: "path must be a GitHub API path, not a URL" };
  const res = await timedFetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "video-engine-claw",
      ...(method !== "GET" ? { "Content-Type": "application/json" } : {})
    },
    body: method === "GET" ? undefined : JSON.stringify(input.body ?? {})
  });
  const text = await res.text();
  let data: unknown = text;
  try { data = JSON.parse(text); } catch { /* keep text */ }
  if (!res.ok) return { ok: false, error: `GitHub HTTP ${res.status}`, hint: text.slice(0, 240) };
  return { ok: true, via: "github", status: res.status, data };
}

export async function resendSend(input: { to?: string; subject?: string; text?: string; html?: string; from?: string }) {
  const key = secret("resend_api_key", "RESEND_API_KEY");
  if (!key) return missing("Resend", "RESEND_API_KEY", "send a transactional email the operator requested");
  const to = String(input.to || "").trim();
  const subject = String(input.subject || "").trim();
  const text = String(input.text || input.html || "").trim();
  if (!to || !subject || !text) return { ok: false, error: "to, subject, and text are required" };
  const from = String(input.from || process.env.RESEND_FROM || "").trim();
  if (!from) return { ok: false, error: "from is required (pass from or set RESEND_FROM)", hint: "Resend requires a verified from address." };
  const res = await timedFetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, text, html: input.html ? String(input.html) : undefined })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: `Resend HTTP ${res.status}`, hint: String(body?.message || "").slice(0, 200) };
  return { ok: true, via: "resend", id: body?.id || null };
}

export async function hedraStatus() {
  const key = secret("hedra_api_key", "HEDRA_API_KEY");
  if (!key) return missing("Hedra", "HEDRA_API_KEY", "check Hedra v3 reachability. This tool never starts a video job.");
  const res = await timedFetch("https://api.hedra.com/v3/models", {
    headers: { Authorization: `Key ${key}`, Accept: "application/json" }
  }, 12_000);
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: `Hedra HTTP ${res.status}`, hint: text.slice(0, 200) + " Confirm HEDRA_API_KEY is a Hedra v3 key, not a video-job id." };
  }
  const body = await res.json().catch(() => ({}));
  const models = Array.isArray(body) ? body : Array.isArray(body?.models) ? body.models : Array.isArray(body?.data) ? body.data : [];
  return {
    ok: true,
    via: "hedra",
    connected: true,
    modelCount: models.length,
    models: models.slice(0, 20).map((m: any) => ({ id: m.id || m.name || m.model, kind: m.type || m.kind || "unknown" })),
    note: "Status only. Video generation stays on the Hedra generate path; this tool does not start a job."
  };
}

export function heliconeStatus() {
  const configured = Boolean(process.env.HELICONE_API_KEY || getRaw("helicone_api_key"));
  const enabled = isHeliconeEnabled();
  return {
    ok: true,
    configured,
    enabled,
    hint: !configured
      ? "Set HELICONE_API_KEY and HELICONE_ENABLED=true to proxy Bitdeer calls. A key alone does not enable the proxy."
      : enabled
        ? "Helicone gateway is wrapping Bitdeer inference requests."
        : "Key is present but HELICONE_ENABLED is off — Claw talks to api-inference.bitdeer.ai directly."
  };
}
