export type ConnectorVia = "composio" | "instagram-mcp";

export type FallbackResult<T> = {
  via: ConnectorVia;
  data: T;
  fallbackNote?: string;
};

export type InstagramConnectorPaths<T> = {
  composio?: () => Promise<T>;
  graph?: () => Promise<T>;
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
 * Both paths can coexist. They are named here so a call site cannot silently
 * reverse the primary and fallback providers by swapping positional arguments.
 *
 * If neither path is provided, throws a clear "not configured" error.
 */
export async function withInstagramFallback<T>(
  op: string,
  paths: InstagramConnectorPaths<T>
): Promise<FallbackResult<T>> {
  const { composio, graph } = paths;
  if (!composio && !graph) {
    throw new Error(`${op} is not configured: neither Composio Instagram nor official Graph (instagram-mcp) is connected.`);
  }
  if (composio) {
    try {
      const data = await composio();
      return { via: "composio", data };
    } catch (composioErr) {
      const composioMsg = errMsg(composioErr);
      if (!graph) throw composioErr;
      try {
        const data = await graph();
        return {
          via: "instagram-mcp",
          data,
          fallbackNote: `${op}: Composio failed (${composioMsg}). Used official Graph (instagram-mcp).`
        };
      } catch (graphErr) {
        throw new Error(`${op} failed on both paths. Composio: ${composioMsg}. Graph (instagram-mcp): ${errMsg(graphErr)}`);
      }
    }
  }
  // Only Graph is wired
  const data = await graph!();
  return { via: "instagram-mcp", data, fallbackNote: `${op}: Composio Instagram is not connected. Used official Graph (instagram-mcp).` };
}
