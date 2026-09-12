import { NextResponse } from "next/server";
import { connectorInventory } from "@/lib/claw/connectors";
import { aionConnectors, aionMcpStatus, isAionConfigured } from "@/lib/claw/aion";
import { isComposioConfigured } from "@/lib/composio/client";
import { denyUnlessAdmin } from "@/lib/claw/brain-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Live connector / MCP registry. Booleans and when-to-use only — never raw keys. */
export async function GET() {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;
  const connectors = connectorInventory();
  const rows = Object.entries(connectors).map(([id, meta]) => {
    const row = meta as { configured?: boolean; when?: string; owner?: string; keyType?: string; note?: string; enabled?: boolean; role?: string };
    return {
      id,
      kind: id === "bitdeer" || id === "nvidia" ? "claw-brain" : id === "composio" ? "mcp" : id === "aion" || id === "cursor" ? "brain" : "connector",
      configured: Boolean(row.configured),
      missing: !row.configured,
      when: row.when || "",
      owner: row.owner || "ccfl",
      keyType: row.keyType,
      note: row.note,
      enabled: row.enabled,
      role: row.role,
    };
  });
  const brainSnapshot = await aionConnectors();
  const mcp = await aionMcpStatus();
  return NextResponse.json({
    ok: true,
    refreshedAt: new Date().toISOString(),
    clawBrain: { provider: "bitdeer", role: "primary", note: "Default Claw chat/vision/embed/rerank. Optional Gemini/xAI/Kimi/OpenAI tools do not replace this." },
    brain: { configured: isAionConfigured(), owner: "aion-brain" },
    brainSnapshot: brainSnapshot.ok ? brainSnapshot : { ok: false, trinity: brainSnapshot.trinity, error: brainSnapshot.error, code: brainSnapshot.code },
    mcp: mcp.ok ? mcp : { ok: false, trinity: mcp.trinity, error: mcp.error, code: mcp.code },
    composio: { configured: isComposioConfigured(), transport: "https://connect.composio.dev/mcp" },
    connectors: rows,
    count: rows.length,
    configured: rows.filter((r) => r.configured).length,
    missing: rows.filter((r) => r.missing).length,
  });
}
