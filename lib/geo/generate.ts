import { db } from "@/lib/db";
import { getBlogPost, type BlogPostRecord } from "@/lib/nvidia/blog-writer";
import { getSite } from "@/lib/sites";
import { writeGeoMetadata } from "@/lib/nvidia/geo-writer";
import { buildPageSchema } from "@/lib/geo/schema-generator";
import { scoreGeoPost } from "@/lib/geo/score";

export type GeoGenerateResult = {
  post: BlogPostRecord;
  schema: Record<string, unknown>;
  score: number;
  maxScore: number;
};

function postUrl(siteUrl: string, slug: string): string {
  return `${siteUrl.replace(/\/$/, "")}/${slug}`;
}

/** Generate (or regenerate) the FAQ/JSON-LD/GEO-score for one ready blog_posts
 *  row and persist it. Requires the article body to already exist (run
 *  generateFullBlogPost first). */
export async function generateGeoForPost(postId: string): Promise<GeoGenerateResult> {
  const post = getBlogPost(postId);
  if (!post) throw new Error("Blog post not found");
  if (post.generationStatus !== "ready" || !post.bodyMarkdown) throw new Error(`Post is ${post.generationStatus}; generate the article body first`);
  const site = getSite(post.siteId);
  if (!site) throw new Error("Site not found");

  const geo = await writeGeoMetadata({ title: post.title, bodyMarkdown: post.bodyMarkdown });
  const schema = buildPageSchema(
    {
      url: postUrl(site.url, post.slug),
      headline: post.metaTitle || post.title,
      description: post.metaDescription || post.excerpt,
      datePublished: post.scheduledAt || new Date().toISOString(),
      imageUrl: post.imageUrl
    },
    geo.faqPairs
  );
  const score = scoreGeoPost({ bodyMarkdown: post.bodyMarkdown, hasJsonLd: true, faqPairCount: geo.faqPairs.length });

  db.prepare("UPDATE blog_posts SET geo_schema_json=?,geo_faq_json=?,geo_score=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(
    JSON.stringify(schema),
    JSON.stringify(geo.faqPairs),
    score.score,
    postId
  );

  return { post: getBlogPost(postId)!, schema, score: score.score, maxScore: score.maxScore };
}

/** Build a plain-text llms.txt manifest for a site: summary + published
 *  article URLs + key citable facts. Follows the emerging llms.txt
 *  convention (a Markdown-flavored manifest AI crawlers can fetch). */
export function buildLlmsTxt(siteId: string): string {
  const site = getSite(siteId);
  if (!site) throw new Error("Site not found");
  const posts = db.prepare(
    "SELECT title,slug,excerpt,meta_description,geo_faq_json FROM blog_posts WHERE site_id=? AND status='published' ORDER BY updated_at DESC LIMIT 200"
  ).all(siteId) as Array<{ title: string; slug: string; excerpt: string; meta_description: string | null; geo_faq_json: string | null }>;

  const lines: string[] = [];
  lines.push(`# ${site.name}`);
  lines.push("");
  lines.push(`> ${site.topicFocus || site.brandVoice || "Published content for AI answer engines to reference."}`);
  lines.push("");
  if (posts.length) {
    lines.push("## Articles");
    lines.push("");
    for (const p of posts) {
      lines.push(`- [${p.title}](${postUrl(site.url, p.slug)}): ${(p.meta_description || p.excerpt || "").slice(0, 200)}`);
    }
    lines.push("");
  }
  const facts = posts
    .flatMap((p) => {
      try { return (JSON.parse(p.geo_faq_json || "[]") as { q: string; a: string }[]).map((f) => f.a); } catch { return []; }
    })
    .slice(0, 40);
  if (facts.length) {
    lines.push("## Key facts");
    lines.push("");
    for (const f of facts) lines.push(`- ${f}`);
  }
  return lines.join("\n");
}
