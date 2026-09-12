import { aionDecision } from "@/lib/claw/aion";
import { brainProxyError, brainResponse, denyUnlessAdmin } from "@/lib/claw/brain-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Proxy → Aion-Brain POST /api/decision. Brain owns Trinity + 7-law judgment. */
export async function POST(req: Request) {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;
  try {
    const body = await req.json().catch(() => ({}));
    const result = await aionDecision({
      user_input: body.user_input || body.prompt || body.goal || body.text,
      history: body.history,
      retrieved: body.retrieved,
      metadata: body.metadata,
    });
    return brainResponse(result);
  } catch (e) {
    return brainProxyError(e, "decision proxy");
  }
}
