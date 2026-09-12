import { NextResponse } from "next/server";
import { runCursorControl } from "@/lib/cursor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await runCursorControl({ op: "status", id });
    if (!result.ok) {
      const code = result.code === "MISSING_KEY" ? 503 : result.status && result.status >= 400 ? result.status : 502;
      return NextResponse.json(result, { status: code });
    }
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({
      ok: false,
      trinity: "HOLD",
      error: e instanceof Error ? e.message : "cursor get failed",
      owner: "ccfl",
    }, { status: 500 });
  }
}
