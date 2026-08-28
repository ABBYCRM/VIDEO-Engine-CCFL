// Pure, non-AI GEO (Generative-Engine Optimization) scorecard. Checks the
// signals that make a page easy for an AI answer engine to cite correctly:
// structured data, an FAQ block, direct-answer paragraph structure, and
// attributed statistics.

export type GeoScoreInput = {
  bodyMarkdown: string | null;
  hasJsonLd: boolean;
  faqPairCount: number;
};

export type GeoCheck = { id: string; label: string; pass: boolean; detail: string };
export type GeoScoreResult = { score: number; maxScore: number; checks: GeoCheck[] };

function headingsWithFollowingParagraph(markdown: string): { heading: string; firstSentence: string }[] {
  const lines = markdown.split("\n");
  const out: { heading: string; firstSentence: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const heading = lines[i].match(/^#{2,4}\s+(.+)$/);
    if (!heading) continue;
    const next = lines.slice(i + 1).find((l) => l.trim().length > 0);
    if (!next) continue;
    const firstSentence = next.trim().split(/(?<=[.!?])\s/)[0] || "";
    out.push({ heading: heading[1].trim(), firstSentence });
  }
  return out;
}

/** Rough heuristic: does the first sentence after a heading share at least
 *  one significant (4+ char) word with the heading itself? That's the
 *  "answer the question in the first sentence" pattern AI answer engines
 *  favor when lifting a direct quote. */
function answersDirectly(heading: string, firstSentence: string): boolean {
  const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter((w) => w.length >= 4));
  const headingWords = words(heading);
  const sentenceWords = words(firstSentence);
  for (const w of headingWords) if (sentenceWords.has(w)) return true;
  return false;
}

export function scoreGeoPost(input: GeoScoreInput): GeoScoreResult {
  const checks: GeoCheck[] = [];
  const body = (input.bodyMarkdown || "").trim();

  checks.push({ id: "structured-data", label: "Page has JSON-LD structured data", pass: input.hasJsonLd, detail: input.hasJsonLd ? "present" : "missing" });
  checks.push({ id: "faq-block", label: "Page has an FAQ block (3+ Q&A pairs)", pass: input.faqPairCount >= 3, detail: `${input.faqPairCount} pair(s)` });

  const sections = headingsWithFollowingParagraph(body);
  const directAnswers = sections.filter((s) => answersDirectly(s.heading, s.firstSentence));
  checks.push({
    id: "direct-answer-paragraphs",
    label: "Most sections answer their heading directly in the first sentence",
    pass: sections.length > 0 && directAnswers.length / sections.length >= 0.5,
    detail: `${directAnswers.length}/${sections.length} section(s)`
  });

  const statPattern = /\b\d+(\.\d+)?%|\b\d{2,}\b/;
  const statLines = body.split("\n").filter((l) => statPattern.test(l));
  const attributedStatLines = statLines.filter((l) => /according to|source:|study|report|survey|data from/i.test(l));
  checks.push({
    id: "attributed-stats",
    label: "Statistics in the article are attributed to a source",
    pass: statLines.length === 0 || attributedStatLines.length / statLines.length >= 0.5,
    detail: statLines.length ? `${attributedStatLines.length}/${statLines.length} attributed` : "no statistics found"
  });

  const score = checks.filter((c) => c.pass).length;
  return { score, maxScore: checks.length, checks };
}
