import { aionAgents } from "@/lib/claw/aion";
import { brainProxyError, brainResponse } from "@/lib/claw/brain-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Proxy → Aion-Brain POST /api/agents/spawn. Dynamic ephemeral subagent. */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const result = await aionAgents({
      op: "spawn",
      goal: body.goal || body.prompt || body.task,
      tools: body.tools,
      acceptance: body.acceptance || body.checks,
      context: body.context,
      callback_url: body.callback_url,
      parent_id: body.parent_id,
      max_cycles: body.max_cycles,
    });
    return brainResponse(result, result.ok ? 202 : 400);
  } catch (e) {
    return brainProxyError(e, "agents spawn proxy");
  }
}
