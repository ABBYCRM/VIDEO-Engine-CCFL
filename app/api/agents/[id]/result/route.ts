import { aionAgents } from "@/lib/claw/aion";
import { brainProxyError, brainResponse } from "@/lib/claw/brain-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    return brainResponse(await aionAgents({ op: "result", id }));
  } catch (e) {
    return brainProxyError(e, "agents result proxy");
  }
}
