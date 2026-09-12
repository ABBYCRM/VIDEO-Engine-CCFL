import { aionBosMemory } from "@/lib/claw/aion";
import { brainProxyError, brainResponse, denyUnlessAdmin } from "@/lib/claw/brain-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Proxy → Aion-Brain GET /api/memory/bos. Durable BOS RAG lives in bos-omega.sqlite. */
export async function GET(req: Request) {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q") || searchParams.get("query") || "";
    const topKRaw = searchParams.get("topK");
    const topK = topKRaw ? Number(topKRaw) : undefined;
    const result = await aionBosMemory({
      query,
      topK: Number.isFinite(topK) ? topK : undefined,
    });
    return brainResponse(result);
  } catch (e) {
    return brainProxyError(e, "bos memory proxy");
  }
}

/** Proxy → Aion-Brain POST /api/memory/bos. Append Continuity only; never wipe Canon/Patch. */
export async function POST(req: Request) {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;
  try {
    const body = await req.json().catch(() => ({}));
    const text = body.text || body.content || body.query || body.q || "";
    const result = await aionBosMemory({
      write: true,
      text,
      query: text,
      title: body.title || "operator-note",
      sourceId: body.source_id || body.sourceId,
    });
    return brainResponse(result);
  } catch (e) {
    return brainProxyError(e, "bos memory proxy");
  }
}
