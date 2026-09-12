import { NextResponse } from "next/server";
import { aionCursorStatus } from "@/lib/claw/aion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const result = await aionCursorStatus({ id, runId: url.searchParams.get("runId") || undefined });
  const status = result.ok ? 200 : result.code === "AION_UNCONFIGURED" ? 503 : 400;
  return NextResponse.json(result, { status });
}
