export type MarketingCategory =
  | "advertising-creative" | "offers-conversion" | "funnels-journeys"
  | "copywriting" | "consumer-psychology" | "strategy-positioning"
  | "branding" | "paid-media" | "growth-lifecycle"
  | "content-seo-social" | "email-crm" | "research-analytics"
  | "strategic-shorthand";

export type FunnelStage = "awareness" | "consideration" | "conversion" | "retention";
export type MarketingGoal = "awareness" | "leads" | "sales" | "activation" | "retention" | "research" | "measurement";

export interface MarketingTerm {
  name: string;
  definition: string;
  category: MarketingCategory;
  aliases: string[];
}

export interface UsageGuide extends MarketingTerm {
  when: string;
  where: string;
  how: string;
  why: string;
  caution?: string;
}

export interface MarketingBrief {
  product: string;
  audience: string;
  goal: MarketingGoal;
  funnelStage: FunnelStage;
  channels: string[];
  businessModel?: "b2b" | "b2c" | "dtc" | "saas" | "ecommerce" | "other";
  budget?: number;
  constraints?: string[];
}

export interface MarketingPlan {
  brief: MarketingBrief;
  objective: string;
  steps: Array<{ phase: string; action: string; terms: string[]; output: string }>;
  guardrails: string[];
}

export type ImageProviderId = "hedra" | "gemini" | "a2e";

export interface ImageGenerationInput {
  prompt: string;
  aspectRatio?: "1:1" | "16:9" | "9:16" | "4:3" | "3:4";
  width?: number;
  height?: number;
}

export interface ImageGenerationResult {
  provider: ImageProviderId;
  status: "complete" | "pending";
  url?: string;
  dataUrl?: string;
  jobId?: string;
  failures: Array<{ provider: ImageProviderId; reason: string }>;
}
