import { NextResponse } from "next/server";
import { aionRoutines } from "@/lib/claw/aion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  const result = await aionRoutines({ op: "delete", name });
  return NextResponse.json(result, { status: result.ok ? 200 : result.code === "AION_UNCONFIGURED" ? 503 : 404 });
}
