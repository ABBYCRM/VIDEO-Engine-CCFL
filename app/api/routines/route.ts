import { NextResponse } from "next/server";
import { aionRoutines } from "@/lib/claw/aion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Proxy → Aion-Brain RoutineStore. Persist is Brain routines.sqlite. */
export async function GET() {
  const result = await aionRoutines({ op: "list" });
  return NextResponse.json(result, { status: result.ok ? 200 : result.code === "AION_UNCONFIGURED" ? 503 : 400 });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const result = await aionRoutines({
    op: "create",
    name: body.name,
    trigger: body.trigger || body.text,
    text: body.text,
    steps: body.steps,
    success: body.success,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : result.code === "AION_UNCONFIGURED" ? 503 : 400 });
}
