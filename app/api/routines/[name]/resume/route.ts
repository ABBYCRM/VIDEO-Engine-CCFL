import { aionRoutines } from "@/lib/claw/aion";
import { brainResponse } from "@/lib/claw/brain-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  const result = await aionRoutines({ op: "resume", name });
  return brainResponse(result, result.ok ? 200 : result.code === "AION_UNCONFIGURED" ? 503 : 404);
}
