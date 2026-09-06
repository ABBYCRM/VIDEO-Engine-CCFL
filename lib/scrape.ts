// Public-web scrape chain for Claw: Steel → Firecrawl → ScrapingBee → Scrapfly.
// Credentials come from process.env (or the Steel settings-store fallback).
import { isSteelConfigured, scrapeWithSteel } from "@/lib/steel";
import { validateSteelUrl } from "@/lib/steel-url";

const TIMEOUT_MS = 45_000;
const MAX_MARKDOWN_CHARS = 12_000;

export function isFirecrawlConfigured(): boolean {
  return Boolean(process.env.FIRECRAWL_API_KEY?.trim());
}
export function isScrapingBeeConfigured(): boolean {
  return Boolean(process.env.SCRAPINGBEE_API_KEY?.trim());
}
export function isScrapflyConfigured(): boolean {
  return Boolean(process.env.SCRAPFLY_API_KEY?.trim());
}

function clip(text: string) {
  return { markdown: text.slice(0, MAX_MARKDOWN_CHARS), truncated: text.length > MAX_MARKDOWN_CHARS };
}

async function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try { return await fn(ac.signal); } finally { clearTimeout(timer); }
}

async function scrapeFirecrawl(url: string) {
  const key = process.env.FIRECRAWL_API_KEY!.trim();
  return withTimeout(async (signal) => {
    const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, formats: ["markdown"] }),
      signal,
      cache: "no-store"
    });
    const body = await res.json().catch(() => ({})) as { success?: boolean; data?: { markdown?: string; metadata?: { title?: string; description?: string; statusCode?: number } }; error?: string };
    if (!res.ok || body.success === false) throw new Error(`Firecrawl HTTP ${res.status}: ${String(body.error || JSON.stringify(body)).slice(0, 300)}`);
    const md = body.data?.markdown || "";
    return {
      via: "firecrawl",
      url,
      statusCode: body.data?.metadata?.statusCode ?? res.status,
      title: body.data?.metadata?.title || null,
      description: body.data?.metadata?.description || null,
      ...clip(md),
      screenshotUrl: null,
      links: []
    };
  });
}

function htmlToText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function scrapeScrapingBee(url: string) {
  const key = process.env.SCRAPINGBEE_API_KEY!.trim();
  const endpoint = `https://app.scrapingbee.com/api/v1/?api_key=${encodeURIComponent(key)}&url=${encodeURIComponent(url)}&render_js=false`;
  return withTimeout(async (signal) => {
    const res = await fetch(endpoint, { signal, cache: "no-store" });
    const text = await res.text();
    if (!res.ok) throw new Error(`ScrapingBee HTTP ${res.status}: ${text.slice(0, 300)}`);
    return {
      via: "scrapingbee",
      url,
      statusCode: res.status,
      title: null,
      description: null,
      ...clip(htmlToText(text)),
      screenshotUrl: null,
      links: []
    };
  });
}

async function scrapeScrapfly(url: string) {
  const key = process.env.SCRAPFLY_API_KEY!.trim();
  const endpoint = `https://api.scrapfly.io/scrape?key=${encodeURIComponent(key)}&url=${encodeURIComponent(url)}&format=markdown`;
  return withTimeout(async (signal) => {
    const res = await fetch(endpoint, { signal, cache: "no-store" });
    const body = await res.json().catch(() => ({})) as { result?: { content?: string; status_code?: number }; message?: string };
    if (!res.ok) throw new Error(`Scrapfly HTTP ${res.status}: ${String(body.message || JSON.stringify(body)).slice(0, 300)}`);
    const md = body.result?.content || "";
    return {
      via: "scrapfly",
      url,
      statusCode: body.result?.status_code ?? res.status,
      title: null,
      description: null,
      ...clip(md),
      screenshotUrl: null,
      links: []
    };
  });
}

export async function scrapePublicUrl(input: { url: unknown; delayMs?: unknown; useProxy?: unknown; screenshot?: unknown }) {
  const url = validateSteelUrl(input.url);
  const errors: string[] = [];
  if (isSteelConfigured()) {
    try { return await scrapeWithSteel({ url, delayMs: input.delayMs, useProxy: input.useProxy, screenshot: input.screenshot }); }
    catch (e) { errors.push(`steel: ${e instanceof Error ? e.message : String(e)}`); }
  }
  if (isFirecrawlConfigured()) {
    try { return await scrapeFirecrawl(url); }
    catch (e) { errors.push(`firecrawl: ${e instanceof Error ? e.message : String(e)}`); }
  }
  if (isScrapingBeeConfigured()) {
    try { return await scrapeScrapingBee(url); }
    catch (e) { errors.push(`scrapingbee: ${e instanceof Error ? e.message : String(e)}`); }
  }
  if (isScrapflyConfigured()) {
    try { return await scrapeScrapfly(url); }
    catch (e) { errors.push(`scrapfly: ${e instanceof Error ? e.message : String(e)}`); }
  }
  if (!errors.length) {
    throw new Error("No scrape provider is configured. Set STEEL_API_KEY, FIRECRAWL_API_KEY, SCRAPINGBEE_API_KEY, or SCRAPFLY_API_KEY.");
  }
  throw new Error(`All scrape providers failed. ${errors.join(" | ")}`);
}
