// Pure, no-AI wrapper: turns GEO writer output into valid schema.org JSON-LD.
// No network call — this is a deterministic transform so the JSON-LD can be
// regenerated any time without spending another NVIDIA call.

import type { GeoFaqPair } from "@/lib/nvidia/geo-writer";

export type ArticleSchemaInput = {
  url: string;
  headline: string;
  description: string;
  datePublished: string;
  dateModified?: string;
  imageUrl?: string | null;
  authorName?: string;
};

export function buildArticleSchema(input: ArticleSchemaInput): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: input.headline.slice(0, 110),
    description: input.description.slice(0, 300),
    url: input.url,
    datePublished: input.datePublished,
    dateModified: input.dateModified || input.datePublished,
    ...(input.imageUrl ? { image: [input.imageUrl] } : {}),
    author: { "@type": "Organization", name: input.authorName || "Website" }
  };
}

export function buildFaqSchema(faqPairs: GeoFaqPair[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqPairs.map((pair) => ({
      "@type": "Question",
      name: pair.q,
      acceptedAnswer: { "@type": "Answer", text: pair.a }
    }))
  };
}

/**
 * Combine into the graph the page should embed. When there are FAQ pairs
 * this returns an @graph with both Article and FAQPage nodes (Google
 * supports multiple types per page via @graph); otherwise Article alone.
 */
export function buildPageSchema(article: ArticleSchemaInput, faqPairs: GeoFaqPair[]): Record<string, unknown> {
  const articleSchema = buildArticleSchema(article);
  if (!faqPairs.length) return articleSchema;
  const faqSchema = buildFaqSchema(faqPairs);
  return {
    "@context": "https://schema.org",
    "@graph": [
      { ...articleSchema, "@context": undefined },
      { ...faqSchema, "@context": undefined }
    ]
  };
}
