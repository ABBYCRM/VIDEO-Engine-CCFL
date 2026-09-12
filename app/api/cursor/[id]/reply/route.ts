import { NextResponse } from "next/server";
import { aionCursorReply } from "@/lib/claw/aion";
import { requireAdmin, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Proxy → Aion-Brain POST /api/cursor/:id/reply */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return unauthorized();
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const result = await aionCursorReply({
      id,
      prompt: body.prompt || body.message || body.text,
      mode: body.mode,
    });
    const status = result.ok ? 202 : result.code === "AION_UNCONFIGURED" ? 503 : result.status && result.status >= 400 ? result.status : 400;
    return NextResponse.json(result, { status });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      source: "ccfl-proxy",
      owner: "aion-brain",
      trinity: "HOLD",
      error: e instanceof Error ? e.message : "cursor reply proxy failed",
    }, { status: 500 });
  }
}
