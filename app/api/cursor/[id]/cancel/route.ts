import { NextResponse } from "next/server";
import { unauthorized } from "@/lib/auth";
import { aionCursorCancel } from "@/lib/claw/aion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Proxy → Aion-Brain POST /api/cursor/:id/cancel */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await unauthorized(req);
  if (denied) return denied;
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const result = await aionCursorCancel({ id, runId: body.runId || body.run_id });
    const status = result.ok ? 200 : result.code === "AION_UNCONFIGURED" ? 503 : result.status && result.status >= 400 ? result.status : 400;
    return NextResponse.json(result, { status });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      source: "ccfl-proxy",
      owner: "aion-brain",
      trinity: "HOLD",
      error: e instanceof Error ? e.message : "cursor cancel proxy failed",
    }, { status: 500 });
  }
}
