// General web search for Claw — genuinely different from steel_scrape
// (lib/steel.ts et al.), which fetches ONE known URL. This returns ranked
// results (title/url/snippet) across the whole web for a query, the way a
// search engine does. Exa is primary, Tavily is the fallback.
//
// Verified against both APIs directly during this integration (2026-08-29):
//   - Exa: POST https://api.exa.ai/search, header x-api-key, body
//     {query, numResults}, response {results:[{title,url,publishedDate,
//     text,id,author}]}. The provided key authenticated correctly but
//     returned NO_MORE_CREDITS — a real account-billing state, not an
//     integration bug; this code path is otherwise confirmed reachable.
//   - Tavily: POST https://api.tavily.com/search, Authorization: Bearer
//     <key>, body {query}, response {results:[{title,url,content}]}.
//     The provided key was rejected ("Unauthorized: missing or invalid
//     API key") under both header-Bearer and body-api_key auth shapes,
//     so the request format isn't the issue — the key itself needs
//     checking on Tavily's dashboard.

import { db } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

const EXA_KEY_SETTING = "exa_api_key";
const TAVILY_KEY_SETTING = "tavily_api_key";
const TIMEOUT_MS = 20_000;

function getRaw(key: string): string | null {
  return (db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined)?.value ?? null;
}
function setRaw(key: string, value: string) {
  db.prepare("INSERT INTO settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").run(key, encryptSecret(value.trim()));
}

function getExaKey(): string {
  const encrypted = getRaw(EXA_KEY_SETTING);
  if (encrypted) return decryptSecret(encrypted);
  const key = process.env.EXA_API_KEY?.trim();
  if (!key) throw new Error("Exa is not configured. Save an Exa API key in Settings, or set EXA_API_KEY on the server.");
  return key;
}
function getTavilyKey(): string {
  const encrypted = getRaw(TAVILY_KEY_SETTING);
  if (encrypted) return decryptSecret(encrypted);
  const key = process.env.TAVILY_API_KEY?.trim();
  if (!key) throw new Error("Tavily is not configured. Save a Tavily API key in Settings, or set TAVILY_API_KEY on the server.");
  return key;
}

export function saveExaApiKey(value: string) { setRaw(EXA_KEY_SETTING, value); }
export function saveTavilyApiKey(value: string) { setRaw(TAVILY_KEY_SETTING, value); }
export function isExaConfigured(): boolean { return Boolean(getRaw(EXA_KEY_SETTING) || process.env.EXA_API_KEY?.trim()); }
export function isTavilyConfigured(): boolean { return Boolean(getRaw(TAVILY_KEY_SETTING) || process.env.TAVILY_API_KEY?.trim()); }

export type WebSearchResult = { title: string | null; url: string; snippet: string | null; publishedDate: string | null };

async function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try { return await fn(ac.signal); } finally { clearTimeout(timer); }
}

async function searchExa(query: string, numResults: number): Promise<{ via: string; results: WebSearchResult[] }> {
  return withTimeout(async (signal) => {
    const res = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: { "x-api-key": getExaKey(), "Content-Type": "application/json" },
      body: JSON.stringify({ query, numResults, contents: { text: { maxCharacters: 500 } } }),
      signal,
      cache: "no-store"
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body?.error) throw new Error(`Exa HTTP ${res.status}: ${String(body?.error || JSON.stringify(body)).slice(0, 300)}`);
    const results: WebSearchResult[] = (Array.isArray(body?.results) ? body.results : []).map((r: any) => ({
      title: r.title || null,
      url: r.url,
      snippet: r.text ? String(r.text).slice(0, 500) : null,
      publishedDate: r.publishedDate || null
    }));
    return { via: "exa", results };
  });
}

async function searchTavily(query: string, numResults: number): Promise<{ via: string; results: WebSearchResult[] }> {
  return withTimeout(async (signal) => {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { Authorization: `Bearer ${getTavilyKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, max_results: Math.max(1, Math.min(20, numResults)) }),
      signal,
      cache: "no-store"
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body?.detail?.error) throw new Error(`Tavily HTTP ${res.status}: ${String(body?.detail?.error || JSON.stringify(body)).slice(0, 300)}`);
    const results: WebSearchResult[] = (Array.isArray(body?.results) ? body.results : []).map((r: any) => ({
      title: r.title || null,
      url: r.url,
      snippet: r.content ? String(r.content).slice(0, 500) : null,
      publishedDate: null
    }));
    return { via: "tavily", results };
  });
}

export async function webSearch(input: { query: string; numResults?: number }): Promise<{ via: string; results: WebSearchResult[]; fallbackNote?: string }> {
  const query = input.query.trim();
  if (!query) throw new Error("query is required");
  const numResults = Math.max(1, Math.min(20, input.numResults || 8));
  try {
    return await searchExa(query, numResults);
  } catch (exaErr) {
    try {
      const result = await searchTavily(query, numResults);
      return { ...result, fallbackNote: `Exa failed (${exaErr instanceof Error ? exaErr.message : String(exaErr)}). Used Tavily.` };
    } catch (tavilyErr) {
      throw new Error(`web_search failed on both providers. Exa: ${exaErr instanceof Error ? exaErr.message : String(exaErr)}. Tavily: ${tavilyErr instanceof Error ? tavilyErr.message : String(tavilyErr)}`);
    }
  }
}
