import { NextResponse } from "next/server";
import { runCursorControl } from "@/lib/cursor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const result = await runCursorControl({
      op: "cancel",
      id,
      runId: body.runId || body.run_id,
    });
    if (!result.ok) {
      const code = result.code === "MISSING_KEY" ? 503 : result.code === "BAD_ARGS" ? 400 : result.status && result.status >= 400 ? result.status : 502;
      return NextResponse.json(result, { status: code });
    }
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({
      ok: false,
      trinity: "HOLD",
      error: e instanceof Error ? e.message : "cursor cancel failed",
      owner: "ccfl",
    }, { status: 500 });
  }
}
