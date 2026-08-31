// lib/scrape.ts — Claw-only public-web scrape (Steel.dev).
//
// 2026-08-30 "Claw only" repo strip. The previous build had a
// 4-provider fallback chain (Steel -> Firecrawl -> ScrapingBee ->
// Scrapfly). The operator picked Steel as their scraper; the others
// are stripped with the rest of the pre-Claw build.
import { scrapeWithSteel } from "@/lib/steel";

export async function scrapePublicUrl(input: { url: unknown; delayMs?: unknown; useProxy?: unknown; screenshot?: unknown }) {
  return scrapeWithSteel({ url: input.url, delayMs: input.delayMs, useProxy: input.useProxy, screenshot: input.screenshot });
}
