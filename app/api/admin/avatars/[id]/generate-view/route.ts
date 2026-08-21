// POST /api/admin/avatars/[id]/generate-view
//   body: { view: AvatarView }
//   -> { started, view, turnaroundStatus }
//
// Single-view regenerate. Used by the per-view "Regenerate" button
// when one view came out wrong.

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { isImageProviderConfigured, startTurnaround } from "@/lib/avatar-generation/client";
import { VIEWS, type AvatarView } from "@/lib/avatars";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isImageProviderConfigured()) {
    return NextResponse.json({
      error: "Image API key not configured.",
      needsImageKey: true
    }, { status: 503 });
  }
  const { id } = await params;
  let body: { view?: AvatarView } = {};
  try { body = await req.json(); } catch {}
  if (!body.view || !VIEWS.includes(body.view)) {
    return NextResponse.json({ error: "Invalid or missing 'view'" }, { status: 400 });
  }
  try {
    const result = await startTurnaround(id, { views: [body.view] });
    if (result.reason) {
      return NextResponse.json({ error: result.reason, started: [], skipped: result.skipped }, { status: 400 });
    }
    return NextResponse.json({
      started: result.started,
      skipped: result.skipped,
      view: body.view,
      turnaroundStatus: "generating"
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
