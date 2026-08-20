// Shared types for VIDEO-Engine planning layer + downstream job creation.
// The planning layer (lib/planning/*) compiles a CampaignPlan from the
// reusable prompt RAG library; that plan is then handed to lib/jobs.ts
// to dispatch to a video provider.

export type VideoRequestCategory =
  | "vehicle_accident"
  | "rideshare_accident"
  | "trucking_accident"
  | "slip_fall"
  | "ugc";

// Wide input for the planner. Optional fields are filled in as the operator
// moves through Campaigns → Avatars → Background → Mission. The planner is
// tolerant: any field can be missing.
export type VideoRequest = {
  category: VideoRequestCategory;
  mission?: string;
  script?: string;
  dialogue?: string;
  subject?: string;
  website?: string;
  targetAudience?: string;
  tone?: string;
  platform?: string;
  avatarId?: string;
  backgroundId?: string;
  siteContext?: string;
};

export type CampaignPlan = {
  objective: string;
  strategy: string[];
  hooks: string[];
  competitorAngles: string[];
  outputPrompt: string;
};

export type MonitorModel =
  | "nvidia/llama-3.1-nemotron-70b-instruct"
  | "nvidia/nemotron-4-340b-instruct"
  | "disabled";
