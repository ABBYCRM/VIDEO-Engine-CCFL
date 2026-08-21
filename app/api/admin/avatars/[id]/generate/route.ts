// POST /api/admin/avatars/[id]/generate
//   body: { views?: AvatarView[] }   (default: all 4)
//   -> { started, skipped, turnaroundStatus }
//
// Fire-and-forget: the route kicks off background generation and returns
// the views that were queued. Per-view status flips to "ready" or
// "failed" as each call completes. The Avatars page polls the avatar
// row to update the per-view status pills.

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  isImageProviderConfigured,
  startTurnaround
} from "@/lib/avatar-generation/client";
import { VIEWS, type AvatarView } from "@/lib/avatars";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isImageProviderConfigured()) {
    return NextResponse.json({
      error: "Image API key not configured. Set one in Settings → Avatars (or via the env vars GEMINI_API_KEY / OPENAI_API_KEY).",
      needsImageKey: true
    }, { status: 503 });
  }
  const { id } = await params;
  let body: { views?: AvatarView[] } = {};
  try { body = await req.json(); } catch {}
  const views = Array.isArray(body.views) && body.views.length
    ? body.views.filter((v): v is AvatarView => VIEWS.includes(v as AvatarView))
    : VIEWS;
  if (!views.length) {
    return NextResponse.json({ error: "No valid views specified" }, { status: 400 });
  }
  try {
    const result = await startTurnaround(id, { views });
    if (result.reason) {
      return NextResponse.json({ error: result.reason, started: [], skipped: result.skipped }, { status: 400 });
    }
    return NextResponse.json({
      started: result.started,
      skipped: result.skipped,
      turnaroundStatus: "generating"
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
