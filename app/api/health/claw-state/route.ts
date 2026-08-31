import { NextResponse } from "next/server";
import { isClawEnabled } from "@/lib/feature-flags";

export const runtime = "nodejs";

// Returns the current Claw state (enabled / disabled) and which
// external services the chat turn would touch if it were running.
// Public, no auth — the operator's "kill every Claw connection"
// directive on 2026-08-30 needs a way to verify from a phone that
// the flag actually flipped, without logging in to the admin UI.
export async function GET() {
  const enabled = isClawEnabled();
  return NextResponse.json({
    claw: enabled ? "enabled" : "disabled",
    flag: "CLAW_ENABLED",
    current: String(process.env.CLAW_ENABLED ?? "true"),
    // The chat turn opens these connections on first message. Listing
    // them here is informational only — none of them are actually
    // contacted by this endpoint.
    disconnectsWhenDisabled: [
      "nvidia (chat completion stream — LLM call)",
      "composio (Reddit, Instagram OAuth tool calls)",
      "instagram-graph (publishing, comments, DMs, insights)",
      "steel (live web scrape)",
      "firecrawl (alt web scrape)",
      "nvidia-vision (image analysis)",
      "hedra / a2e / gemini / openai / grok (image generation)",
      "screenshotone (web screenshot)",
      "exa / tavily (web search)"
    ]
  });
}
