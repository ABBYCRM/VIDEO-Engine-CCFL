import { NextResponse } from "next/server";
import { clawProviderStatus } from "@/lib/claw/provider-status";

export const runtime = "nodejs";

// Public, no auth — operator can confirm Claw + tool wiring from a phone.
// Never includes secret values.
export async function GET() {
  const status = clawProviderStatus();
  return NextResponse.json({
    ...status,
    disconnectsWhenDisabled: [
      "nvidia (chat completion stream — LLM + native tool_calls)",
      "composio (Connect MCP or project tools)",
      "steel / firecrawl / scrapingbee / scrapfly (web scrape)",
      "screenshotone (web screenshot)",
      "exa / tavily (web search)",
      "e2b (sandbox)",
      "github (GITHUB_PERSONAL_ACCESS_TOKEN)",
      "resend (email)",
      "aion-brain (consult / curriculum / n8n)",
      "hedra (status only — does not start extra video jobs)"
    ]
  });
}
