import { NextResponse } from "next/server";
import { aionBosMemory } from "@/lib/claw/aion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function statusFor(result: { ok: boolean; code?: string; status?: number }) {
  if (result.ok) return 200;
  if (result.code === "AION_UNCONFIGURED") return 503;
  if (typeof result.status === "number" && result.status >= 400) return result.status;
  return 400;
}

/** Proxy → Aion-Brain GET /api/memory/bos. Durable BOS RAG lives in bos-omega.sqlite. */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q") || searchParams.get("query") || "";
    const topKRaw = searchParams.get("topK");
    const topK = topKRaw ? Number(topKRaw) : undefined;
    const result = await aionBosMemory({
      query,
      topK: Number.isFinite(topK) ? topK : undefined,
    });
    return NextResponse.json(result, { status: statusFor(result) });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      source: "ccfl-proxy",
      owner: "aion-brain",
      trinity: "HOLD",
      persist: "bos-omega.sqlite",
      error: e instanceof Error ? e.message : "bos memory proxy failed",
    }, { status: 500 });
  }
}

/** Proxy → Aion-Brain POST /api/memory/bos. Append Continuity only; never wipe Canon/Patch. */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const text = body.text || body.content || body.query || body.q || "";
    const result = await aionBosMemory({
      write: true,
      text,
      query: text,
      title: body.title || "operator-note",
    });
    return NextResponse.json(result, { status: statusFor(result) });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      source: "ccfl-proxy",
      owner: "aion-brain",
      trinity: "HOLD",
      persist: "bos-omega.sqlite",
      error: e instanceof Error ? e.message : "bos memory proxy failed",
    }, { status: 500 });
  }
}
