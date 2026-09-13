import { aionAgents } from "@/lib/claw/aion";
import { brainProxyError, brainResponse } from "@/lib/claw/brain-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    return brainResponse(await aionAgents({ op: "stop", id }));
  } catch (e) {
    return brainProxyError(e, "agents stop proxy");
  }
}
