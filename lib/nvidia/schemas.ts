// Strict structural schemas for every NVIDIA output. The whole point of
// "structured JSON, not free-form text" (operator's brief) is to validate
// before we let the result anywhere near the database or UI.
//
// We use a tiny hand-rolled validator instead of pulling Zod into the
// dependency graph: the surface area here is small, the rules are obvious,
// and the runtime has to stay tiny for App Platform cold-starts.

import { isNvidiaModelId, type NvidiaModelId } from "./models";

export class SchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchemaError";
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function nonEmptyString(v: unknown, field: string): string {
  if (typeof v !== "string" || v.trim().length === 0) {
    throw new SchemaError(`${field} must be a non-empty string`);
  }
  return v.trim();
}

function stringArray(v: unknown, field: string, maxLen = 30): string[] {
  if (!Array.isArray(v)) throw new SchemaError(`${field} must be an array of strings`);
  if (v.length > maxLen) throw new SchemaError(`${field} must be at most ${maxLen} items`);
  return v.map((x, i) => nonEmptyString(x, `${field}[${i}]`));
}

function optionalStringArray(v: unknown, field: string, maxLen = 30): string[] | undefined {
  if (v === undefined || v === null) return undefined;
  return stringArray(v, field, maxLen);
}

function optionalString(v: unknown, field: string): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") throw new SchemaError(`${field} must be a string`);
  return v.trim();
}

function optionalObject(v: unknown, field: string): Record<string, unknown> | undefined {
  if (v === undefined || v === null) return undefined;
  if (!isObject(v)) throw new SchemaError(`${field} must be an object`);
  return v;
}

const PLATFORM_KEYS = ["instagram", "facebook", "youtube", "tiktok", "x", "linkedin", "reddit"] as const;
export type PlatformKey = (typeof PLATFORM_KEYS)[number];

export type PlatformCopy = {
  // For "reddit" this field carries the post body; for "x" it carries the
  // tweet text (truncated to 280 chars below); every other platform uses it
  // as its normal primary caption/post text.
  primaryText: string;
  // For "reddit" this is the submission title. For every other platform,
  // an optional headline/on-screen title.
  title?: string;
  description?: string;
  cta?: string;
  hashtags?: string[];
};

const X_MAX_CHARS = 280;

export type SocialContentPackage = {
  hook: string;
  primaryText: string;
  shortCaption: string;
  longCaption: string;
  reelTitle: string;
  cta: string;
  hashtags: string[];
  platformVariants: Partial<Record<PlatformKey, PlatformCopy>>;
  // provenance: which NVIDIA model produced this, plus a short rationale.
  provenance: {
    model: NvidiaModelId;
    inputs: Record<string, unknown>;
    rationale: string;
  };
};

export function parsePlatformCopy(v: unknown, field: string, key?: PlatformKey): PlatformCopy {
  if (!isObject(v)) throw new SchemaError(`${field} must be an object`);
  let primaryText = nonEmptyString(v.primaryText, `${field}.primaryText`);
  // X has a hard platform character cap. Truncate rather than reject — the
  // model is instructed to stay under it, but a slightly-over response
  // shouldn't fail the whole content package.
  if (key === "x" && primaryText.length > X_MAX_CHARS) primaryText = primaryText.slice(0, X_MAX_CHARS);
  return {
    primaryText,
    title: optionalString(v.title, `${field}.title`),
    description: optionalString(v.description, `${field}.description`),
    cta: optionalString(v.cta, `${field}.cta`),
    hashtags: optionalStringArray(v.hashtags, `${field}.hashtags`)
  };
}

export function parseSocialContentPackage(raw: unknown, fallbackModel: NvidiaModelId): SocialContentPackage {
  if (!isObject(raw)) throw new SchemaError("content package must be a JSON object");
  const hook = nonEmptyString(raw.hook, "hook");
  if (hook.length > 240) throw new SchemaError("hook must be 240 chars or fewer");
  const primaryText = nonEmptyString(raw.primaryText, "primaryText");
  if (primaryText.length > 1500) throw new SchemaError("primaryText must be 1500 chars or fewer");
  const shortCaption = nonEmptyString(raw.shortCaption, "shortCaption");
  if (shortCaption.length > 280) throw new SchemaError("shortCaption must be 280 chars or fewer");
  const longCaption = nonEmptyString(raw.longCaption, "longCaption");
  if (longCaption.length > 2200) throw new SchemaError("longCaption must be 2200 chars or fewer");
  const reelTitle = nonEmptyString(raw.reelTitle, "reelTitle");
  if (reelTitle.length > 100) throw new SchemaError("reelTitle must be 100 chars or fewer");
  const cta = nonEmptyString(raw.cta, "cta");
  if (cta.length > 120) throw new SchemaError("cta must be 120 chars or fewer");
  const hashtags = stringArray(raw.hashtags, "hashtags", 30).map(h => h.replace(/^#/, "").trim());

  const variantsRaw = optionalObject(raw.platformVariants, "platformVariants") ?? {};
  const platformVariants: Partial<Record<PlatformKey, PlatformCopy>> = {};
  for (const key of PLATFORM_KEYS) {
    if (variantsRaw[key] !== undefined) {
      platformVariants[key] = parsePlatformCopy(variantsRaw[key], `platformVariants.${key}`, key);
    }
  }

  const provenanceRaw = optionalObject(raw.provenance, "provenance");
  const model = isNvidiaModelId(provenanceRaw?.model) ? provenanceRaw!.model as NvidiaModelId : fallbackModel;
  const rationale = typeof provenanceRaw?.rationale === "string" ? provenanceRaw.rationale.trim().slice(0, 800) : "No rationale returned by model.";

  return {
    hook,
    primaryText,
    shortCaption,
    longCaption,
    reelTitle,
    cta,
    hashtags,
    platformVariants,
    provenance: { model, inputs: {}, rationale }
  };
}

// Monitor output schema: a list of named findings + a list of recommendations
// + an overall status. The monitor MUST never fabricate numbers; every numeric
// field references an input metric by id.
export type MonitorFinding = {
  id: string;
  kind: "winner" | "loser" | "weak-data" | "opportunity";
  dimension: "prompt" | "hook" | "avatar" | "copy" | "cta" | "style" | "platform" | "audience";
  subject: string;
  metricIds: string[];
  summary: string;
};

export type MonitorRecommendation = {
  id: string;
  appliesTo: { campaignId?: string; providerId?: string; scope?: string };
  change: string;
  expectedImpact: string;
  confidence: "low" | "medium" | "high";
};

export type MonitorRun = {
  status: "dormant" | "ok" | "error";
  reason?: string;             // populated when status !== "ok"
  findings: MonitorFinding[];
  recommendations: MonitorRecommendation[];
  meta: {
    model: NvidiaModelId;
    scope: string;
    metricCount: number;
    finishedAt: string;
  };
};

export function parseMonitorRun(raw: unknown, fallbackModel: NvidiaModelId, scope: string, metricCount: number): MonitorRun {
  const finishedAt = new Date().toISOString();
  if (raw === null || raw === undefined) {
    return { status: "dormant", findings: [], recommendations: [], meta: { model: fallbackModel, scope, metricCount, finishedAt } };
  }
  if (!isObject(raw)) throw new SchemaError("monitor run must be an object");
  const status = raw.status;
  if (status !== "dormant" && status !== "ok" && status !== "error") {
    throw new SchemaError("monitor status must be dormant | ok | error");
  }
  if (status === "dormant") {
    return {
      status,
      reason: typeof raw.reason === "string" ? raw.reason.slice(0, 500) : "no ad-account metrics available",
      findings: [],
      recommendations: [],
      meta: { model: fallbackModel, scope, metricCount, finishedAt }
    };
  }
  const findings = Array.isArray(raw.findings) ? raw.findings.map((f, i) => {
    if (!isObject(f)) throw new SchemaError(`findings[${i}] must be an object`);
    return {
      id: nonEmptyString(f.id, `findings[${i}].id`),
      kind: f.kind,
      dimension: f.dimension,
      subject: nonEmptyString(f.subject, `findings[${i}].subject`),
      metricIds: stringArray(f.metricIds ?? [], `findings[${i}].metricIds`, 50),
      summary: nonEmptyString(f.summary, `findings[${i}].summary`)
    } as MonitorFinding;
  }) : [];
  const recommendations = Array.isArray(raw.recommendations) ? raw.recommendations.map((r, i) => {
    if (!isObject(r)) throw new SchemaError(`recommendations[${i}] must be an object`);
    return {
      id: nonEmptyString(r.id, `recommendations[${i}].id`),
      appliesTo: isObject(r.appliesTo) ? r.appliesTo as MonitorRecommendation["appliesTo"] : {},
      change: nonEmptyString(r.change, `recommendations[${i}].change`),
      expectedImpact: nonEmptyString(r.expectedImpact, `recommendations[${i}].expectedImpact`),
      confidence: r.confidence === "low" || r.confidence === "medium" || r.confidence === "high" ? r.confidence : "low"
    } as MonitorRecommendation;
  }) : [];
  return { status, findings, recommendations, meta: { model: fallbackModel, scope, metricCount, finishedAt } };
}
