export type ConnectorVia = "instagram-mcp" | "composio";

export type FallbackResult<T> = {
  via: ConnectorVia;
  data: T;
  fallbackNote?: string;
};

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

/** Run official Graph (instagram-mcp) first. If it fails and a Composio path exists, use it and tell Claw. */
export async function withInstagramFallback<T>(
  op: string,
  mcp: () => Promise<T>,
  composio?: () => Promise<T>
): Promise<FallbackResult<T>> {
  try {
    const data = await mcp();
    return { via: "instagram-mcp", data };
  } catch (mcpErr) {
    const mcpMsg = errMsg(mcpErr);
    if (!composio) throw mcpErr;
    try {
      const data = await composio();
      return {
        via: "composio",
        data,
        fallbackNote: `${op}: instagram-mcp failed (${mcpMsg}). Used Composio.`
      };
    } catch (composioErr) {
      throw new Error(`${op} failed on both paths. Graph (instagram-mcp): ${mcpMsg}. Composio: ${errMsg(composioErr)}`);
    }
  }
}
