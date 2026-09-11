import { validateSteelUrl } from "@/lib/steel-url";
import {
  createCaptchaSession,
  isSteelConfigured,
  releaseCaptchaSession,
  scrapeWithSteel,
} from "@/lib/steel";
import { isExaConfigured, isTavilyConfigured, webSearch } from "@/lib/web-search";

export type SteelSearchHit = { title: string; url: string; snippet: string };

export type SteelSearchResult = {
  ok: boolean;
  via: string;
  solvedCaptcha: boolean;
  query: string;
  markdown?: string;
  results: SteelSearchHit[];
  error?: string;
  viewerUrl?: string | null;
};

function looksLikeCaptcha(text: string): boolean {
  const lower = text.toLowerCase();
  return [
    "captcha",
    "verify you are human",
    "unusual traffic",
    "select all squares",
    "i'm not a robot",
    "are you a robot",
  ].some((m) => lower.includes(m));
}

function toHits(links: Array<{ text?: string | null; url?: string | null }>): SteelSearchHit[] {
  const hits: SteelSearchHit[] = [];
  const seen = new Set<string>();
  for (const link of links) {
    const url = String(link.url || "").trim();
    if (!url || !/^https?:/i.test(url)) continue;
    let host = "";
    try {
      host = new URL(url).hostname;
    } catch {
      continue;
    }
    if (/(^|\.)duckduckgo\.com$/.test(host) || host === "duck.com") continue;
    if (seen.has(url)) continue;
    seen.add(url);
    hits.push({
      title: String(link.text || url).replace(/\s+/g, " ").trim().slice(0, 160) || url,
      url,
      snippet: "",
    });
    if (hits.length >= 10) break;
  }
  return hits;
}

function hitsFromMarkdown(markdown: string): SteelSearchHit[] {
  const hits: SteelSearchHit[] = [];
  const seen = new Set<string>();
  const re = /\[([^\]]{2,160})\]\((https?:\/\/[^)\s]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) && hits.length < 10) {
    const url = m[2];
    try {
      const host = new URL(url).hostname;
      if (/(^|\.)duckduckgo\.com$/.test(host)) continue;
    } catch {
      continue;
    }
    if (seen.has(url)) continue;
    seen.add(url);
    hits.push({ title: m[1].replace(/\s+/g, " ").trim(), url, snippet: "" });
  }
  return hits;
}

async function searchViaSteelSession(query: string, url: string): Promise<SteelSearchResult> {
  const session = await createCaptchaSession();
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.connectOverCDP(session.connectUrl, { timeout: 20_000 });
    try {
      const context = browser.contexts()[0] ?? (await browser.newContext());
      const page = context.pages()[0] ?? (await context.newPage());
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 40_000 });
      await page.waitForTimeout(4500);
      const text = (await page.innerText("body").catch(() => "")).slice(0, 8000);
      const links = await page.$$eval("a[href]", (as) =>
        as.slice(0, 50).map((a) => ({
          text: (a.textContent || "").trim(),
          url: (a as HTMLAnchorElement).href,
        })),
      );
      const results = toHits(links);
      return {
        ok: results.length > 0 || text.length > 80,
        via: "steel.session+captcha",
        solvedCaptcha: true,
        query,
        markdown: text,
        results,
        viewerUrl: session.viewerUrl,
      };
    } finally {
      await browser.close().catch(() => undefined);
    }
  } finally {
    await releaseCaptchaSession(session.id).catch(() => undefined);
  }
}

/** Steel proxy scrape, then Steel session with CAPTCHA solver, then Exa/Tavily. */
export async function searchViaSteel(query: string): Promise<SteelSearchResult> {
  const q = query.trim();
  if (!q) return { ok: false, via: "none", solvedCaptcha: false, query: q, results: [], error: "query is required" };
  const url = validateSteelUrl(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`);
  const errors: string[] = [];

  if (isSteelConfigured()) {
    try {
      const scraped = await scrapeWithSteel({ url, useProxy: true, delayMs: 1800 });
      const markdown = scraped.markdown || "";
      const results = toHits([
        ...(scraped.links || []).map((l) => ({ text: l.text, url: l.url })),
        ...hitsFromMarkdown(markdown).map((h) => ({ text: h.title, url: h.url })),
      ]);
      if (!looksLikeCaptcha(markdown) && (results.length > 0 || markdown.length > 240)) {
        return {
          ok: true,
          via: "steel.scrape+proxy",
          solvedCaptcha: false,
          query: q,
          markdown: markdown.slice(0, 8000),
          results,
        };
      }
      errors.push("steel.scrape: captcha or empty");
    } catch (e) {
      errors.push(`steel.scrape: ${e instanceof Error ? e.message : String(e)}`);
    }

    try {
      const sessioned = await searchViaSteelSession(q, url);
      if (sessioned.ok) return sessioned;
      errors.push(`steel.session: empty (${sessioned.error || "no results"})`);
    } catch (e) {
      errors.push(`steel.session: ${e instanceof Error ? e.message : String(e)}`);
    }
  } else {
    errors.push("steel: not configured");
  }

  if (isExaConfigured() || isTavilyConfigured()) {
    try {
      const web = await webSearch({ query: q, numResults: 10 });
      return {
        ok: web.results.length > 0,
        via: web.via,
        solvedCaptcha: false,
        query: q,
        results: web.results.map((r) => ({
          title: r.title || r.url,
          url: r.url,
          snippet: r.snippet || "",
        })),
        error: errors.length ? errors.join(" | ") : undefined,
      };
    } catch (e) {
      errors.push(`web_search: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return {
    ok: false,
    via: "none",
    solvedCaptcha: false,
    query: q,
    results: [],
    error: errors.join(" | ") || "search failed",
  };
}
