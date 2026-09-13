import { aionAgents } from "@/lib/claw/aion";
import { brainProxyError, brainResponse } from "@/lib/claw/brain-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Proxy → Aion-Brain GET /api/agents/:id. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    return brainResponse(await aionAgents({ op: "get", id }));
  } catch (e) {
    return brainProxyError(e, "agents get proxy");
  }
}
