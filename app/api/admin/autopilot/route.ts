import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { isAutopilotEnabled, setAutopilotEnabled } from "@/lib/autopilot-control";

// The shared on/off switch for every autonomous background pipeline
// (Reddit market-research, Site/IG autopilot). Same flag Claw's
// autopilot_stop/autopilot_start tools flip — this route exists so the UI
// can show and toggle it without going through chat.
export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ enabled: isAutopilotEnabled() });
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const enabled = Boolean(body.enabled);
  setAutopilotEnabled(enabled);
  return NextResponse.json({ enabled });
}
