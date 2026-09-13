import { aionAgents } from "@/lib/claw/aion";
import { brainProxyError, brainResponse } from "@/lib/claw/brain-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Proxy → Aion-Brain GET /api/agents. */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    return brainResponse(await aionAgents({
      op: "list",
      parent_id: searchParams.get("parent_id") || undefined,
      status: searchParams.get("status") || undefined,
      limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined,
    }));
  } catch (e) {
    return brainProxyError(e, "agents list proxy");
  }
}
