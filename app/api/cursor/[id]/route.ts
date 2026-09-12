import { NextResponse } from "next/server";
import { aionCursorStatus } from "@/lib/claw/aion";
import { denyUnlessAdmin } from "@/lib/claw/brain-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Proxy → Aion-Brain GET /api/cursor/:id */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const result = await aionCursorStatus({ id, runId: url.searchParams.get("runId") || undefined });
    const status = result.ok ? 200 : result.code === "AION_UNCONFIGURED" ? 503 : result.status && result.status >= 400 ? result.status : 400;
    return NextResponse.json(result, { status });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      source: "ccfl-proxy",
      owner: "aion-brain",
      trinity: "HOLD",
      error: e instanceof Error ? e.message : "cursor status proxy failed",
    }, { status: 500 });
  }
}
