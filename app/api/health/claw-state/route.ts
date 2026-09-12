import { NextResponse } from "next/server";
import { isClawEnabled } from "@/lib/feature-flags";

export const runtime = "nodejs";

/** Public kill-switch readback. Does not call providers or return secrets. */
export async function GET() {
  const enabled = isClawEnabled();
  return NextResponse.json({
    claw: enabled ? "enabled" : "disabled",
    flag: "CLAW_ENABLED",
    current: String(process.env.CLAW_ENABLED ?? "true"),
    disconnectsWhenDisabled: [
      "bitdeer (chat completion stream)",
      "composio",
      "steel",
      "screenshotone",
      "exa / tavily",
      "e2b sandbox",
      "aion-brain / cursor proxy"
    ]
  });
}
