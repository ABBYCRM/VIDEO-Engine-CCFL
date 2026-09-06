import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport, StreamableHTTPError } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export type ComposioKeyKind = "consumer" | "project" | "organization" | "user" | "unknown";

export function classifyComposioKey(key: string): ComposioKeyKind {
  const k = key.trim();
  if (k.startsWith("ck_")) return "consumer";
  if (k.startsWith("ak_")) return "project";
  if (k.startsWith("oak_")) return "organization";
  if (k.startsWith("uak_")) return "user";
  return "unknown";
}

export function isConsumerKey(key: string): boolean {
  return classifyComposioKey(key) === "consumer";
}

export function composioKeyHint(kind: ComposioKeyKind): string {
  if (kind === "organization") {
    return "COMPOSIO_API_KEY is an organization key (oak_). Claw tools need a project key (ak_) or a Connect consumer key (ck_). Create a project key in the Composio dashboard (Organization → project → API key), not an org access token.";
  }
  if (kind === "user") {
    return "COMPOSIO_API_KEY is a user key (uak_). Claw tools need a project key (ak_) or a Connect consumer key (ck_).";
  }
  if (kind === "unknown") {
    return "COMPOSIO_API_KEY does not start with ak_, oak_, ck_, or uak_. Expected a project key (ak_) for the SDK or a consumer key (ck_) for Connect MCP.";
  }
  return "";
}

// Consumer keys belong to Composio Connect, not the project REST API.
// Keep the credential bound to this fixed HTTPS origin and never retry actions.
export async function withConsumerClient<T>(key: string, run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ name: "video-engine-claw", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL("https://connect.composio.dev/mcp"), {
    requestInit: { headers: { "x-consumer-api-key": key.trim() }, redirect: "error" }
  });
  try {
    await client.connect(transport, { timeout: 20_000 });
    return await run(client);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = error instanceof StreamableHTTPError && error.code ? `HTTP ${error.code}: ` : "";
    throw new Error(status + message.split(key.trim()).join("[redacted]"));
  } finally {
    await client.close().catch(() => {});
  }
}

export async function listConsumerTools(key: string) {
  return withConsumerClient(key, async client => {
    const tools = [];
    let cursor: string | undefined;
    const seen = new Set<string>();
    do {
      const page = await client.listTools(cursor ? { cursor } : {}, { timeout: 20_000 });
      tools.push(...page.tools);
      cursor = page.nextCursor;
      if (cursor && seen.has(cursor)) throw new Error("Composio repeated a tools cursor");
      if (cursor) seen.add(cursor);
      if (seen.size > 100) throw new Error("Composio tool pagination exceeded its limit");
    } while (cursor);
    return tools;
  });
}

export async function callConsumerTool(key: string, name: string, args: Record<string, unknown>) {
  return withConsumerClient(key, client => client.callTool({ name, arguments: args }, undefined, { timeout: 120_000 }));
}
