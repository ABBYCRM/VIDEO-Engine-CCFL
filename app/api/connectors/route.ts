import { NextResponse } from "next/server";
import { connectorInventory } from "@/lib/claw/connectors";
import { isAionConfigured } from "@/lib/claw/aion";
import { isComposioConfigured } from "@/lib/composio/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Live connector / MCP registry. Booleans and when-to-use only — never raw keys. */
export async function GET() {
  const connectors = connectorInventory();
  const rows = Object.entries(connectors).map(([id, meta]) => {
    const row = meta as { configured?: boolean; when?: string; owner?: string; keyType?: string; note?: string; enabled?: boolean };
    return {
      id,
      kind: id === "composio" ? "mcp" : id === "aion" || id === "cursor" ? "brain" : "connector",
      configured: Boolean(row.configured),
      missing: !row.configured,
      when: row.when || "",
      owner: row.owner || "ccfl",
      keyType: row.keyType,
      note: row.note,
      enabled: row.enabled,
    };
  });
  return NextResponse.json({
    ok: true,
    refreshedAt: new Date().toISOString(),
    brain: { configured: isAionConfigured(), owner: "aion-brain" },
    composio: { configured: isComposioConfigured(), transport: "https://connect.composio.dev/mcp" },
    connectors: rows,
    count: rows.length,
    configured: rows.filter((r) => r.configured).length,
    missing: rows.filter((r) => r.missing).length,
  });
}
