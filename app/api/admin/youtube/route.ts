import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { youTubeStatus, setYouTubeClient, disconnectYouTube } from "@/lib/youtube";

export const runtime = "nodejs";

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(youTubeStatus());
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const clientId = String(body?.clientId || "").trim();
  const clientSecret = String(body?.clientSecret || "").trim();
  if (!clientId || !clientSecret) return NextResponse.json({ error: "clientId and clientSecret are required" }, { status: 400 });
  setYouTubeClient(clientId, clientSecret);
  return NextResponse.json({ ok: true, ...youTubeStatus() });
}

export async function DELETE() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  disconnectYouTube();
  return NextResponse.json({ ok: true, ...youTubeStatus() });
}
