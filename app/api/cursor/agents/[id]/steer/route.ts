import { NextResponse } from "next/server";
import { aionCursorReply } from "@/lib/claw/aion";
import { requireAdmin, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return unauthorized();
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const result = await aionCursorReply({ id, prompt: body.prompt || body.message || body.text, mode: body.mode });
  const status = result.ok ? 202 : result.code === "AION_UNCONFIGURED" ? 503 : 400;
  return NextResponse.json(result, { status });
}
