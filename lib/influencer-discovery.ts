// Influencer Agent discovery. Two paths, both grounded in real, already-
// verified capabilities of this app — no general-purpose scraping of a
// platform's own search/discovery surfaces:
//
// 1. First-party: Instagram Graph's business_discovery field, using this
//    app's own already-connected Instagram token (lib/instagram-graph.ts).
//    Works only for public Business/Creator Instagram accounts.
// 2. Operator-supplied URL: the operator pastes one public page (a creator
//    directory, a "best X accounts in Y niche" roundup, a hashtag page).
//    Steel.dev renders it (lib/steel.ts, already SSRF-guarded) and NVIDIA
//    structures whatever creators are already listed on that one page
//    (lib/nvidia/influencer-extractor.ts). This never crawls beyond the
//    one supplied URL.

import { businessDiscovery } from "@/lib/instagram-graph";
import { isSteelConfigured, scrapeWithSteel } from "@/lib/steel";
import { extractInfluencerCandidates, type InfluencerCandidate } from "@/lib/nvidia/influencer-extractor";
import { createInfluencer, type Influencer } from "@/lib/influencers";

export async function discoverByInstagramUsername(username: string): Promise<Influencer> {
  const profile = await businessDiscovery(username);
  return createInfluencer({
    handle: profile.username,
    platform: "instagram",
    profileUrl: `https://instagram.com/${profile.username}`,
    followerCount: profile.followers_count ?? null,
    niche: profile.biography ? profile.biography.slice(0, 200) : null,
    contactEmail: null,
    notes: profile.biography || "",
    source: "instagram_business_discovery"
  });
}

export async function discoverFromUrl(input: { sourceUrl: string; nicheHint?: string | null }): Promise<{ candidates: InfluencerCandidate[]; saved: Influencer[] }> {
  if (!isSteelConfigured()) throw new Error("Steel.dev is not configured (STEEL_API_KEY). Cannot render the source page.");
  const scraped = await scrapeWithSteel({ url: input.sourceUrl });
  if (!scraped.markdown.trim()) throw new Error("The source page returned no readable content");
  const candidates = await extractInfluencerCandidates({ sourceUrl: input.sourceUrl, markdown: scraped.markdown, nicheHint: input.nicheHint });
  const saved = candidates.map((c) =>
    createInfluencer({
      handle: c.handle,
      platform: c.platform,
      profileUrl: c.profileUrl,
      followerCount: c.followerCount,
      niche: c.niche,
      contactEmail: c.contactEmail,
      source: input.sourceUrl
    })
  );
  return { candidates, saved };
}
