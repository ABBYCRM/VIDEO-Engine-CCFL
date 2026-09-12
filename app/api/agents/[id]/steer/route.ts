import { aionAgents } from "@/lib/claw/aion";
import { brainProxyError, brainResponse, denyUnlessAdmin } from "@/lib/claw/brain-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;
  try {
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    return brainResponse(await aionAgents({
      op: "steer",
      id,
      message: body.message || body.text,
      goal_override: body.goal_override,
    }));
  } catch (e) {
    return brainProxyError(e, "agents steer proxy");
  }
}
