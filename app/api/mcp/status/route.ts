import { aionMcpStatus } from "@/lib/claw/aion";
import { brainProxyError, brainResponse, denyUnlessAdmin } from "@/lib/claw/brain-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Proxy → Aion-Brain GET /api/mcp/status. Names + configured flags only. */
export async function GET() {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;
  try {
    return brainResponse(await aionMcpStatus());
  } catch (e) {
    return brainProxyError(e, "mcp status proxy");
  }
}
