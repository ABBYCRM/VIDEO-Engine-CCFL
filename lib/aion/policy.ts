// lib/aion/policy.ts
//
// Every tool in lib/claw/tools.ts must appear in exactly one set below.
// Enforced by tests/unit/aion-policy-completeness.test.ts, which imports the
// REAL CLAW_TOOLS registry and fails if the two ever drift. The prior draft
// of this file hand-maintained five Sets and silently missed 9 of the 69
// real tools. Never hand-maintain this list without that completeness test
// guarding it.
//
// Risk tier semantics:
//   - read      : read-only, no side effects
//   - draft     : produces a draft artifact, no external trigger (e.g. write_post)
//   - costly    : external provider spend, reversible (videos, images)
//   - external_post : publishes/sends to a customer-visible surface; requires
//                     exact `CONFIRM <tool_name>` from the operator
//   - external_reply : responds to existing user-generated content; logged as
//                      OBSERVATION but auto-runs to keep the daily reply
//                      workflow one-turn. The operator can promote any of
//                      these to external_post by moving the entry.
//   - destructive : irreversible deletion; requires CONFIRM
//   - code      : code or filesystem mutation; requires CONFIRM
//
// (operator directive 2026-08-30, "New era marketing" — kept the corrector's
// shape but split the EXTERNAL set into _post (gate) and _reply (auto-run).
// See the e2e review for the rationale.)

export type RiskLevel =
  | "read"
  | "draft"
  | "costly"
  | "external_post"
  | "external_reply"
  | "destructive"
  | "code";

export type DecisionState = "COMMIT" | "DEFER" | "REJECT";

export type ToolDecision = {
  state: DecisionState;
  riskLevel: RiskLevel;
  rationale: string;
  risks: string[];
  reversible: boolean;
  confirmationRequired: boolean;
  confidence: number;
};

const DESTRUCTIVE = new Set([
  "delete_library_asset",
  "delete_calendar",
  "ig_delete_comment",
  "delete_file",
  "x_delete_tweet"
]);

// Publishes / sends / triggers a future customer-visible action.
// Requires CONFIRM. update_calendar is here because it can set autoPost:true,
// which authorizes a real future publish — the same trigger class as
// publish_calendar.
const EXTERNAL_POST = new Set([
  "publish_calendar",
  "update_calendar",
  "ig_publish",
  "creator_upload_video",
  "publish_blog_post",
  "ig_send_dm",
  "x_post",
  "x_reply",
  "linkedin_post",
  "linkedin_comment",
  "reddit_submit_post",
  "reddit_reply",
  "send_influencer_outreach",
  // Same class as update_calendar: doesn't publish to Reddit itself (this
  // is read-only research, never a Reddit post/comment/reply), but it
  // queues an Instagram post with auto_post=1 — a real future publish the
  // operator hasn't reviewed — so it needs the same CONFIRM gate.
  "reddit_market_research"
]);

// Responds to existing user-generated content. The customer-facing
// consequence is bounded (someone already said something; this is a
// response). Logged as an OBSERVATION but auto-runs to keep the daily
// reply workflow one-turn.
const EXTERNAL_REPLY = new Set([
  "ig_reply_comment",
  "ig_hide_comment",
  "ig_send_private_reply"
]);

const CODE = new Set(["coding_run", "coding_write_file"]);

const COSTLY = new Set([
  "generate_video",
  "ugc_batch_generate",
  "generate_still",
  "generate_blog_post"
]);

// Read-only or draft-only. No external side effects.
// Additions in this set (post-hand-audit):
//   - rename_file              : renames a Claw file, reversible
//   - discover_influencers     : read-only Graph/Steel research
//   - update_influencer_status : internal pipeline field
//   - generate_strategy        : draft strategy artifact
//   - approve_strategy         : internal approval flag
//   - generate_geo_schema      : FAQ/schema computed from existing post
//   - save_post                : explicitly "no auto-post" by its own description
//   - coding_new_session       : opens a reversible, timeout-bound sandbox;
//                                no code runs until coding_run/write_file
const KNOWN_SAFE = new Set([
  "app_status",
  "composio_health",
  "list_jobs",
  "get_job",
  "list_library",
  "list_calendar",
  "list_campaigns",
  "list_avatars",
  "list_sites",
  "ig_health",
  "ig_list_media",
  "ig_media_insights",
  "ig_get_comments",
  "ig_list_conversations",
  "ig_get_messages",
  "steel_scrape",
  "web_screenshot",
  "web_search",
  "list_files",
  "read_file",
  "list_seo_queue",
  "x_health",
  "x_get_tweet",
  "x_list_mentions",
  "linkedin_health",
  "reddit_search_subreddits",
  "reddit_list_comments",
  "coding_read_file",
  "coding_list_files",
  "list_influencers",
  "audit_website",
  "list_strategies",
  "get_llms_txt",
  "write_post",
  "draft_caption",
  "rename_file",
  "discover_influencers",
  "update_influencer_status",
  "generate_strategy",
  "approve_strategy",
  "generate_geo_schema",
  "save_post",
  "coding_new_session",
  // Read-only image inspection via a vision-capable NVIDIA model — looks
  // at a public image URL and answers a question about it, no writes.
  "ig_analyze_media",
  "analyze_image"
]);

// Exported so the completeness test can verify coverage without duplicating
// this list by hand.
export const CLASSIFIED_TOOL_NAMES: ReadonlySet<string> = new Set([
  ...DESTRUCTIVE,
  ...EXTERNAL_POST,
  ...EXTERNAL_REPLY,
  ...CODE,
  ...COSTLY,
  ...KNOWN_SAFE
]);

// Exported so other gates (e.g. the daily generation-cost cap in
// lib/claw/runtime.ts) reuse the exact same confirmation matching instead
// of a second, potentially-drifting reimplementation.
export function exactConfirmation(text: string, toolName: string): boolean {
  return text.trim().toLowerCase() === `confirm ${toolName}`.toLowerCase();
}

export function decideTool(
  toolName: string,
  operatorText: string
): ToolDecision {
  if (DESTRUCTIVE.has(toolName)) {
    const confirmed = exactConfirmation(operatorText, toolName);
    return {
      state: confirmed ? "COMMIT" : "DEFER",
      riskLevel: "destructive",
      rationale: confirmed
        ? "Authenticated operator supplied exact confirmation."
        : `Reply exactly: CONFIRM ${toolName}`,
      risks: ["Irreversible deletion"],
      reversible: false,
      confirmationRequired: true,
      confidence: confirmed ? 1 : 0
    };
  }

  if (EXTERNAL_POST.has(toolName) || CODE.has(toolName)) {
    const confirmed = exactConfirmation(operatorText, toolName);
    return {
      state: confirmed ? "COMMIT" : "DEFER",
      riskLevel: CODE.has(toolName) ? "code" : "external_post",
      rationale: confirmed
        ? "Authenticated operator supplied exact confirmation."
        : `Reply exactly: CONFIRM ${toolName}`,
      risks: CODE.has(toolName)
        ? ["Code or filesystem mutation"]
        : ["Customer-facing external action"],
      reversible: false,
      confirmationRequired: true,
      confidence: confirmed ? 1 : 0
    };
  }

  if (EXTERNAL_REPLY.has(toolName)) {
    return {
      state: "COMMIT",
      riskLevel: "external_reply",
      rationale: "Reply to existing user-generated content; logged as OBSERVATION.",
      risks: ["Customer-facing reply"],
      reversible: false,
      confirmationRequired: false,
      confidence: 1
    };
  }

  if (COSTLY.has(toolName)) {
    return {
      state: "COMMIT",
      riskLevel: "costly",
      rationale: "Authenticated operator requested a generation operation.",
      risks: ["External provider cost"],
      reversible: true,
      confirmationRequired: false,
      confidence: 1
    };
  }

  if (KNOWN_SAFE.has(toolName)) {
    return {
      state: "COMMIT",
      riskLevel: "read",
      rationale: "Read-only or draft-only operation.",
      risks: [],
      reversible: true,
      confirmationRequired: false,
      confidence: 1
    };
  }

  return {
    state: "REJECT",
    riskLevel: "code",
    rationale: "Tool is absent from the reviewed AION policy.",
    risks: ["Unknown tool behavior"],
    reversible: false,
    confirmationRequired: false,
    confidence: 1
  };
}
