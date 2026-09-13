import { aionRoutines } from "@/lib/claw/aion";
import { brainResponse } from "@/lib/claw/brain-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Proxy → Aion-Brain POST /api/routines/:name/run. */
export async function POST(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  const result = await aionRoutines({ op: "run", name });
  return brainResponse(result);
}
