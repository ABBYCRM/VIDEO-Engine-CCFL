// Pure, non-AI SEO scorecard for one blog_posts row. No model call — cheap
// enough to run on every save. Mirrors the checks a human SEO editor would
// run: title length, meta description length, focus-keyword placement.

export type SeoScoreInput = {
  title: string;
  metaTitle: string | null;
  metaDescription: string | null;
  focusKeyword: string | null;
  bodyMarkdown: string | null;
  slug: string;
};

export type SeoCheck = { id: string; label: string; pass: boolean; detail: string };
export type SeoScoreResult = { score: number; maxScore: number; checks: SeoCheck[] };

function firstParagraph(markdown: string): string {
  const withoutHeadings = markdown.split("\n").filter(line => !/^#{1,6}\s/.test(line.trim()));
  return withoutHeadings.find(line => line.trim().length > 0)?.trim() || "";
}

export function scoreSeoPost(input: SeoScoreInput): SeoScoreResult {
  const checks: SeoCheck[] = [];
  const metaTitle = (input.metaTitle || input.title || "").trim();
  const metaDescription = (input.metaDescription || "").trim();
  const focusKeyword = (input.focusKeyword || "").trim().toLowerCase();
  const body = (input.bodyMarkdown || "").trim();

  checks.push({
    id: "title-length",
    label: "Title length (50-60 chars)",
    pass: metaTitle.length >= 50 && metaTitle.length <= 60,
    detail: `${metaTitle.length} chars`
  });

  checks.push({
    id: "meta-description-length",
    label: "Meta description length (120-160 chars)",
    pass: metaDescription.length >= 120 && metaDescription.length <= 160,
    detail: `${metaDescription.length} chars`
  });

  checks.push({
    id: "keyword-present",
    label: "Focus keyword is set",
    pass: focusKeyword.length > 0,
    detail: focusKeyword || "none"
  });

  checks.push({
    id: "keyword-in-title",
    label: "Focus keyword appears in the title",
    pass: Boolean(focusKeyword) && metaTitle.toLowerCase().includes(focusKeyword),
    detail: metaTitle
  });

  const intro = firstParagraph(body).toLowerCase();
  checks.push({
    id: "keyword-in-intro",
    label: "Focus keyword appears in the first paragraph",
    pass: Boolean(focusKeyword) && intro.includes(focusKeyword),
    detail: intro.slice(0, 160)
  });

  const h2Count = (body.match(/^##\s+/gm) || []).length;
  checks.push({
    id: "has-headings",
    label: "Article has at least 2 H2 subheadings",
    pass: h2Count >= 2,
    detail: `${h2Count} H2 heading(s)`
  });

  const wordCount = body.split(/\s+/).filter(Boolean).length;
  checks.push({
    id: "min-length",
    label: "Article body is at least 400 words",
    pass: wordCount >= 400,
    detail: `${wordCount} words`
  });

  checks.push({
    id: "slug-format",
    label: "Slug is lowercase, hyphenated, no special characters",
    pass: /^[a-z0-9]+(-[a-z0-9]+)*$/.test(input.slug),
    detail: input.slug
  });

  const score = checks.filter(c => c.pass).length;
  return { score, maxScore: checks.length, checks };
}
