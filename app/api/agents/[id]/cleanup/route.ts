import { aionAgents } from "@/lib/claw/aion";
import { brainProxyError, brainResponse, denyUnlessAdmin } from "@/lib/claw/brain-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;
  try {
    const { id } = await ctx.params;
    return brainResponse(await aionAgents({ op: "cleanup", id }));
  } catch (e) {
    return brainProxyError(e, "agents cleanup proxy");
  }
}
