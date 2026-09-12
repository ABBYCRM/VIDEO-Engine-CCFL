import { NextResponse } from "next/server";
import { aionDecision } from "@/lib/claw/aion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Proxy → Aion-Brain POST /api/decision. Brain owns Trinity + 7-law judgment. */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const result = await aionDecision({
      user_input: body.user_input || body.prompt || body.goal || body.text,
      history: body.history,
      retrieved: body.retrieved,
      metadata: body.metadata,
    });
    const status = result.ok ? 200 : result.code === "AION_UNCONFIGURED" ? 503 : result.trinity === "ABORT" && !result.ok ? 400 : 400;
    return NextResponse.json(result, { status });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      source: "ccfl-proxy",
      owner: "aion-brain",
      trinity: "HOLD",
      error: e instanceof Error ? e.message : "decision proxy failed",
    }, { status: 500 });
  }
}
