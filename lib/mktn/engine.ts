import { explainTerm, findTerms } from "./usage.ts";
import type { MarketingBrief, MarketingPlan, UsageGuide } from "./types.ts";

const termsForGoal: Record<MarketingBrief["goal"], string[]> = {
  awareness: ["STP", "Positioning", "Brand awareness", "Reach", "Frequency", "Creative concept", "Hook"],
  leads: ["Ideal Customer Profile", "Lead magnet", "Landing page", "Lead-generation funnel", "Cost per lead", "Nurture sequence"],
  sales: ["Offer", "Value proposition", "Proof", "Objection handling", "Call to Action", "Conversion rate", "Return on ad spend"],
  activation: ["Onboarding", "Activation", "Micro-conversion", "Friction", "Product-led growth", "Cohort analysis"],
  retention: ["Retention", "Churn", "Reactivation", "Net Revenue Retention", "Customer lifetime value", "Cohort analysis"],
  research: ["Market research", "Customer interview", "Voice of Customer", "Jobs to Be Done", "Segmentation", "Message-market fit"],
  measurement: ["Key Performance Indicator", "North-star metric", "Attribution", "Incrementality", "Lift test", "Confidence interval"],
};

const termsForStage: Record<MarketingBrief["funnelStage"], string[]> = {
  awareness: ["Top of Funnel", "Brand ad", "Content marketing", "Organic social", "Share of voice"],
  consideration: ["Middle of Funnel", "Case study", "Testimonial", "Demo ad", "Nurture sequence"],
  conversion: ["Bottom of Funnel", "Direct-response ad", "Sales page", "Checkout", "Risk reversal"],
  retention: ["Onboarding", "Retention", "Reactivation", "Referral program", "Expansion revenue"],
};

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export function validateBrief(input: unknown): MarketingBrief {
  if (!input || typeof input !== "object") throw new TypeError("Brief must be an object.");
  const body = input as Record<string, unknown>;
  const product = String(body.product ?? "").trim();
  const audience = String(body.audience ?? "").trim();
  const goals = Object.keys(termsForGoal) as MarketingBrief["goal"][];
  const stages = Object.keys(termsForStage) as MarketingBrief["funnelStage"][];
  if (!product) throw new TypeError("product is required.");
  if (!audience) throw new TypeError("audience is required.");
  if (!goals.includes(body.goal as MarketingBrief["goal"])) throw new TypeError("goal is invalid.");
  if (!stages.includes(body.funnelStage as MarketingBrief["funnelStage"])) throw new TypeError("funnelStage is invalid.");
  const channels = Array.isArray(body.channels)
    ? body.channels.map(String).map((v) => v.trim()).filter(Boolean).slice(0, 12)
    : [];
  if (!channels.length) throw new TypeError("At least one channel is required.");
  const brief: MarketingBrief = {
    product,
    audience,
    goal: body.goal as MarketingBrief["goal"],
    funnelStage: body.funnelStage as MarketingBrief["funnelStage"],
    channels,
  };
  if (typeof body.businessModel === "string" && ["b2b", "b2c", "dtc", "saas", "ecommerce", "other"].includes(body.businessModel)) {
    brief.businessModel = body.businessModel as MarketingBrief["businessModel"];
  }
  if (typeof body.budget === "number" && Number.isFinite(body.budget) && body.budget >= 0) brief.budget = body.budget;
  if (Array.isArray(body.constraints)) brief.constraints = body.constraints.map(String).map((v) => v.trim()).filter(Boolean).slice(0, 20);
  return brief;
}

export function recommendedGuides(brief: MarketingBrief): UsageGuide[] {
  return unique([...termsForGoal[brief.goal], ...termsForStage[brief.funnelStage]])
    .flatMap((name) => findTerms(name).slice(0, 1))
    .map(explainTerm);
}

export function buildMarketingPlan(raw: unknown): MarketingPlan {
  const brief = validateBrief(raw);
  const selected = recommendedGuides(brief).map((guide) => guide.name);
  return {
    brief,
    objective: `${brief.goal} for ${brief.product} among ${brief.audience} through ${brief.channels.join(", ")}.`,
    steps: [
      { phase: "Market", action: "Validate the audience, situation, alternatives, and language with direct evidence.", terms: selected.filter((t) => /market|customer|voice|jobs|segment|audience|profile/i.test(t)), output: "Audience evidence brief" },
      { phase: "Position", action: "Choose the frame of reference, differentiated value, promise, and proof.", terms: selected.filter((t) => /position|value|offer|proof|brand/i.test(t)), output: "Positioning and offer brief" },
      { phase: "Create", action: `Produce channel-native assets for ${brief.channels.join(", ")} around one message and one action.`, terms: selected.filter((t) => /creative|hook|content|ad|case|testimonial|demo|call/i.test(t)), output: "Creative matrix and variants" },
      { phase: "Convert", action: "Connect each asset to the next journey step and remove avoidable friction.", terms: selected.filter((t) => /funnel|page|checkout|friction|risk|nurture|onboarding/i.test(t)), output: "Journey map with tracked events" },
      { phase: "Measure", action: "Predefine the decision metric, denominator, attribution window, guardrail, and stopping rule.", terms: selected.filter((t) => /rate|cost|return|reach|frequency|retention|churn|cohort|lift|indicator|metric/i.test(t)), output: "Measurement and experiment plan" },
    ],
    guardrails: [
      "Use only substantiated claims and authentic proof.",
      "Never fabricate scarcity, urgency, testimonials, settlements, diagnoses, police/news evidence, or guarantees.",
      "Treat generated reenactments as generated content and keep accident content non-graphic by default.",
      "Respect consent, privacy, suppression lists, platform policy, and applicable advertising law.",
      "Do not interpret attributed conversions as causal without incrementality evidence.",
    ],
  };
}
