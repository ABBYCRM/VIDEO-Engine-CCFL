import { NextResponse } from "next/server";
import { aionCursorStatus } from "@/lib/claw/aion";
import { requireAdmin, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Proxy → Aion-Brain GET /api/cursor (list). */
export async function GET(req: Request) {
  if (!(await requireAdmin())) return unauthorized();
  try {
    const url = new URL(req.url);
    const result = await aionCursorStatus({
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
      cursor: url.searchParams.get("cursor") || undefined,
    });
    const status = result.ok ? 200 : result.code === "AION_UNCONFIGURED" ? 503 : result.status && result.status >= 400 ? result.status : 400;
    return NextResponse.json(result, { status });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      source: "ccfl-proxy",
      owner: "aion-brain",
      trinity: "HOLD",
      error: e instanceof Error ? e.message : "cursor list proxy failed",
    }, { status: 500 });
  }
}
