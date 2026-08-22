import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { isAvatarImageProviderConfigured, startAvatarTurnaround } from "@/lib/avatar-generation/provider";
import { VIEWS, type AvatarView } from "@/lib/avatars";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAvatarImageProviderConfigured()) {
    return NextResponse.json({
      error: "Selected image provider is not configured. NVIDIA uses NVIDIA_API_KEY; Gemini/OpenAI use their configured provider keys.",
      needsImageKey: true
    }, { status: 503 });
  }
  const { id } = await params;
  let body: { views?: AvatarView[] } = {};
  try { body = await req.json(); } catch {}
  const views = Array.isArray(body.views) && body.views.length
    ? body.views.filter((v): v is AvatarView => VIEWS.includes(v as AvatarView))
    : VIEWS;
  if (!views.length) return NextResponse.json({ error: "No valid views specified" }, { status: 400 });
  try {
    const result = await startAvatarTurnaround(id, { views });
    if (result.reason) return NextResponse.json({ error: result.reason, started: [], skipped: result.skipped }, { status: 400 });
    return NextResponse.json({ started: result.started, skipped: result.skipped, turnaroundStatus: "generating" });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
