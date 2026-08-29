export type InstagramDmCapabilityInput = {
  composioReady: boolean;
  graphReady: boolean;
  graphDmEnabled: boolean;
};

export const INSTAGRAM_DM_SEND_POLICY =
  "DM replies require an existing conversation and a qualifying user interaction inside Meta's 24-hour messaging window.";

/**
 * Composio and the direct Graph connector both call Meta's Instagram
 * messaging API. The direct connector has an extra local safety toggle;
 * that toggle must never make an otherwise-ready Composio DM path appear
 * disabled.
 */
export function getInstagramDmCapability(input: InstagramDmCapabilityInput) {
  const composio = input.composioReady;
  const graph = input.graphReady && input.graphDmEnabled;
  return {
    available: composio || graph,
    primary: composio ? "composio" as const : graph ? "instagram-mcp" as const : null,
    providers: { composio, graph },
    policy: INSTAGRAM_DM_SEND_POLICY
  };
}
