// Shared "what is the firm's site actually saying right now" grounding,
// used by every autonomous content pipeline (Reddit market-research,
// Site/IG autopilot) so a model-driven judgment call — which category to
// lean toward, when signal is ambiguous — stays anchored to real, current
// site content instead of drifting. Never fatal: a failed or unconfigured
// scrape just means a pipeline proceeds without this context, exactly as
// if this module didn't exist.

import { scrapePublicUrl } from "@/lib/scrape";

export const BRAND_SITE_URL = "https://caseclosedfl.com";

export type SiteContext = { title: string | null; description: string | null; excerpt: string };

export async function fetchSiteContext(): Promise<SiteContext | null> {
  try {
    const scraped = await scrapePublicUrl({ url: BRAND_SITE_URL });
    return {
      title: scraped.title || null,
      description: scraped.description || null,
      excerpt: String(scraped.markdown || "").slice(0, 1500)
    };
  } catch (e) {
    console.warn("[brand-context] site scrape failed, continuing without it:", e instanceof Error ? e.message : e);
    return null;
  }
}
