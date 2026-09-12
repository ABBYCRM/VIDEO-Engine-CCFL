import { NextResponse } from "next/server";
import { unauthorized } from "@/lib/auth";
import { aionCursorCancel } from "@/lib/claw/aion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await unauthorized(req);
  if (denied) return denied;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const result = await aionCursorCancel({ id, runId: body.runId });
  const status = result.ok ? 200 : result.code === "AION_UNCONFIGURED" ? 503 : 400;
  return NextResponse.json(result, { status });
}
