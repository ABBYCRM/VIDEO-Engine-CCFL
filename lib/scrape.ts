// Shared public-web scrape orchestration: Steel.dev first (supports an
// inline screenshot + a proxy), falling back to Firecrawl, ScrapingBee, and
// Scrapfly in order if a provider fails or isn't configured. Extracted from
// Claw's steel_scrape tool handler so any background pipeline (not just an
// interactive chat turn) can reuse the exact same fallback chain instead of
// re-implementing it.

import { scrapeWithSteel } from "@/lib/steel";
import { scrapeWithFirecrawl } from "@/lib/firecrawl";
import { scrapeWithScrapingBee } from "@/lib/scrapingbee";
import { scrapeWithScrapfly } from "@/lib/scrapfly";

export async function scrapePublicUrl(input: { url: unknown; delayMs?: unknown; useProxy?: unknown; screenshot?: unknown }) {
  const attempts: { name: string; run: () => Promise<any> }[] = [
    { name: "steel.dev", run: () => scrapeWithSteel({ url: input.url, delayMs: input.delayMs, useProxy: input.useProxy, screenshot: input.screenshot }) },
    { name: "firecrawl", run: () => scrapeWithFirecrawl({ url: input.url }) },
    { name: "scrapingbee", run: () => scrapeWithScrapingBee({ url: input.url }) },
    { name: "scrapfly", run: () => scrapeWithScrapfly({ url: input.url }) }
  ];
  const errors: string[] = [];
  for (const attempt of attempts) {
    try {
      const result = await attempt.run();
      if (errors.length) result.fallbackNote = `Tried ${errors.length} provider(s) first: ${errors.join("; ")}`;
      return result;
    } catch (e) {
      errors.push(`${attempt.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  throw new Error(`scrape failed on every provider. ${errors.join(" | ")}`);
}
