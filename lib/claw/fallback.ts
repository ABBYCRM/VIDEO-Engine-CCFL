export type ConnectorVia = "composio" | "instagram-mcp";

export type FallbackResult<T> = {
  via: ConnectorVia;
  data: T;
  fallbackNote?: string;
};

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Instagram path resolver (operator directive 2026-08-29):
 * Try Composio first (the MCP the operator uses day-to-day).
 * Only fall back to official Graph (instagram-mcp) if Composio is not connected
 * or the Composio call errors.
 *
 * Both paths can coexist; the operator may add Graph credentials later
 * (e.g. for `instagram_manage_messages` DMs inside Meta's 24h window) and
 * Composio stays primary for everything else.
 *
 * If neither path is provided, throws a clear "not configured" error.
 */
export async function withInstagramFallback<T>(
  op: string,
  composio?: () => Promise<T>,
  mcp?: () => Promise<T>
): Promise<FallbackResult<T>> {
  if (!composio && !mcp) {
    throw new Error(`${op} is not configured: neither Composio Instagram nor official Graph (instagram-mcp) is connected.`);
  }
  if (composio) {
    try {
      const data = await composio();
      return { via: "composio", data };
    } catch (composioErr) {
      const composioMsg = errMsg(composioErr);
      if (!mcp) throw composioErr;
      try {
        const data = await mcp();
        return {
          via: "instagram-mcp",
          data,
          fallbackNote: `${op}: Composio failed (${composioMsg}). Used official Graph (instagram-mcp).`
        };
      } catch (mcpErr) {
        throw new Error(`${op} failed on both paths. Composio: ${composioMsg}. Graph (instagram-mcp): ${errMsg(mcpErr)}`);
      }
    }
  }
  // Only Graph is wired
  const data = await mcp!();
  return { via: "instagram-mcp", data, fallbackNote: `${op}: Composio Instagram is not connected. Used official Graph (instagram-mcp).` };
}
