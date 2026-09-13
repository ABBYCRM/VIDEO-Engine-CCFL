import { aionMcpStatus } from "@/lib/claw/aion";
import { brainProxyError, brainResponse } from "@/lib/claw/brain-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Proxy → Aion-Brain GET /api/mcp/status. Names + configured flags only. */
export async function GET() {
  try {
    return brainResponse(await aionMcpStatus());
  } catch (e) {
    return brainProxyError(e, "mcp status proxy");
  }
}
