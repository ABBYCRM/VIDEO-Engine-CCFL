// Website Analysis Agent: a standalone marketing/technical-SEO/GEO-readiness
// audit, distinct from the onboarding research in lib/site-research.ts (which
// only extracts brand/SEO defaults once, for the Sites setup form). Reuses
// the exact same SSRF-guarded crawl via crawlPublicSite() so the audit never
// has its own, potentially-drifted safety logic.

import { db } from "@/lib/db";
import { chatCompletion, getNvidiaModel } from "@/lib/nvidia/client";
import { crawlPublicSite } from "@/lib/site-research";
import { getSite } from "@/lib/sites";

function ensureSiteAuditColumn(name: string, ddl: string) {
  try {
    const cols = db.prepare("PRAGMA table_info(sites)").all() as { name: string }[];
    if (!cols.some((c) => c.name === name)) db.exec(`ALTER TABLE sites ADD COLUMN ${ddl}`);
  } catch {}
}
ensureSiteAuditColumn("last_audit_json", "last_audit_json TEXT");
ensureSiteAuditColumn("seo_score", "seo_score INTEGER");
ensureSiteAuditColumn("geo_score", "geo_score INTEGER");
ensureSiteAuditColumn("last_audited_at", "last_audited_at TEXT");

export type SiteAudit = {
  technicalSeo: {
    titleTagIssues: string[];
    metaDescriptionIssues: string[];
    headingStructureNotes: string;
    imageAltCoverageNote: string;
  };
  contentGaps: string[];
  geoReadiness: {
    hasStructuredData: boolean;
    hasFaq: boolean;
    directAnswerParagraphs: boolean;
    citableStatCoverage: string;
  };
  conversionNotes: string[];
  seoScore: number;
  geoScore: number;
  summary: string;
  pagesAnalyzed: string[];
  auditedAt: string;
};

const MAX_SCORE = 10;

export async function auditWebsite(siteIdOrUrl: string): Promise<SiteAudit> {
  const site = getSite(siteIdOrUrl);
  const url = site ? site.url : siteIdOrUrl;
  const { pages, signals, corpus } = await crawlPublicSite(url);

  const response = await chatCompletion({
    model: getNvidiaModel(),
    jsonMode: true,
    temperature: 0.3,
    maxTokens: 2200,
    messages: [
      {
        role: "system",
        content: "You are a technical SEO and GEO (generative-engine optimization) auditor. Infer only from the supplied crawl. Return valid JSON only. Never invent metrics, page-speed numbers, or facts not observable in the supplied HTML-derived text. If something cannot be determined from text alone (e.g. actual page speed), say so in the relevant note field rather than guessing a number."
      },
      {
        role: "user",
        content: `Detected technical CMS signals: ${signals}.\n\nAudit this website crawl and return JSON: {"technicalSeo":{"titleTagIssues":["..."],"metaDescriptionIssues":["..."],"headingStructureNotes":"...","imageAltCoverageNote":"..."},"contentGaps":["topics a visitor would expect but the site does not cover"],"geoReadiness":{"hasStructuredData":true|false,"hasFaq":true|false,"directAnswerParagraphs":true|false,"citableStatCoverage":"none|weak|moderate|strong"},"conversionNotes":["..."],"seoScore":0-10,"geoScore":0-10,"summary":"3-5 sentence audit summary"}. seoScore and geoScore are your own 0-10 judgment of maturity based on everything above — 0 is nonexistent, 10 is excellent.\n\n${corpus}`
      }
    ]
  });

  let parsed: any;
  try {
    parsed = JSON.parse(response.text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, ""));
  } catch {
    throw new Error("AI site audit returned invalid JSON. Please retry.");
  }

  const strArr = (v: any, n = 12): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, n).map((x) => String(x).slice(0, 300)) : []);
  const clampScore = (v: any) => Math.max(0, Math.min(MAX_SCORE, Math.round(Number(v) || 0)));

  const audit: SiteAudit = {
    technicalSeo: {
      titleTagIssues: strArr(parsed?.technicalSeo?.titleTagIssues),
      metaDescriptionIssues: strArr(parsed?.technicalSeo?.metaDescriptionIssues),
      headingStructureNotes: String(parsed?.technicalSeo?.headingStructureNotes || "").slice(0, 800),
      imageAltCoverageNote: String(parsed?.technicalSeo?.imageAltCoverageNote || "").slice(0, 500)
    },
    contentGaps: strArr(parsed?.contentGaps),
    geoReadiness: {
      hasStructuredData: Boolean(parsed?.geoReadiness?.hasStructuredData),
      hasFaq: Boolean(parsed?.geoReadiness?.hasFaq),
      directAnswerParagraphs: Boolean(parsed?.geoReadiness?.directAnswerParagraphs),
      citableStatCoverage: ["none", "weak", "moderate", "strong"].includes(parsed?.geoReadiness?.citableStatCoverage) ? parsed.geoReadiness.citableStatCoverage : "none"
    },
    conversionNotes: strArr(parsed?.conversionNotes),
    seoScore: clampScore(parsed?.seoScore),
    geoScore: clampScore(parsed?.geoScore),
    summary: String(parsed?.summary || "").slice(0, 1500),
    pagesAnalyzed: pages.map((p) => p.url),
    auditedAt: new Date().toISOString()
  };

  if (site) {
    db.prepare("UPDATE sites SET last_audit_json=?,seo_score=?,geo_score=?,last_audited_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(
      JSON.stringify(audit),
      audit.seoScore,
      audit.geoScore,
      audit.auditedAt,
      site.id
    );
  }

  return audit;
}

export function getStoredAudit(siteId: string): SiteAudit | null {
  const row = db.prepare("SELECT last_audit_json FROM sites WHERE id=?").get(siteId) as { last_audit_json: string | null } | undefined;
  return row?.last_audit_json ? JSON.parse(row.last_audit_json) : null;
}
