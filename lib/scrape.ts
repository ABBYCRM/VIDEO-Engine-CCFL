// Public-web scrape chain for Claw.
// Primary: Steel.dev. Fallbacks: Firecrawl → ScrapingBee → Scrapfly.
// Every provider is SSRF-guarded via validateSteelUrl. Failures are
// returned as structured errors, never as invented page content.

import { scrapeWithSteel, isSteelConfigured } from "@/lib/steel";
import { scrapeFirecrawl, scrapeScrapingBee, scrapeScrapfly } from "@/lib/claw/connectors";

export async function scrapePublicUrl(input: { url: unknown; delayMs?: unknown; useProxy?: unknown; screenshot?: unknown }) {
  const errors: string[] = [];
  if (isSteelConfigured()) {
    try {
      const steel = await scrapeWithSteel({ url: input.url, delayMs: input.delayMs, useProxy: input.useProxy, screenshot: input.screenshot });
      return steel;
    } catch (e) {
      errors.push(`steel: ${e instanceof Error ? e.message : String(e)}`);
    }
  } else {
    errors.push("steel: not configured");
  }
  const url = String(input.url || "");
  for (const [name, fn] of [
    ["firecrawl", scrapeFirecrawl],
    ["scrapingbee", scrapeScrapingBee],
    ["scrapfly", scrapeScrapfly]
  ] as const) {
    try {
      const result = await fn(url);
      if (result && "ok" in result && result.ok === false) {
        errors.push(`${name}: ${result.error}`);
        continue;
      }
      return { ...result, fallbackNote: errors.length ? `Primary scrape failed (${errors.join(" | ")}). Used ${name}.` : undefined };
    } catch (e) {
      errors.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { ok: false, error: `scrape failed on every provider. ${errors.join(" | ")}`, hint: "Set STEEL_API_KEY (primary) plus FIRECRAWL_API_KEY / SCRAPINGBEE_API_KEY / SCRAPFLY_API_KEY as fallbacks." };
}
