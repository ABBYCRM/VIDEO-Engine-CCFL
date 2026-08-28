// LinkedIn distribution, via Composio's LinkedIn toolkit. "linkedin" is
// already a registered Composio toolkit with OAuth auth-config tracking and
// connected-account sync (lib/composio/client.ts) — this file adds the
// actual posting actions.
//
// Tool slugs below are Composio's real LinkedIn toolkit action names
// (verified against Composio's toolkit documentation): LINKEDIN_GET_MY_INFO,
// LINKEDIN_CREATE_LINKED_IN_POST, LINKEDIN_DELETE_LINKED_IN_POST,
// LINKEDIN_CREATE_COMMENT_ON_POST.

import { executeComposioTool, getActiveConnectedAccountId, isComposioConfigured } from "@/lib/composio/client";

const TOOLKIT = "linkedin";

export function isLinkedInComposioConnected(): boolean {
  return isComposioConfigured() && Boolean(getActiveConnectedAccountId(TOOLKIT));
}

export async function executeLinkedInComposioTool(slug: string, args: Record<string, unknown>) {
  return executeComposioTool(TOOLKIT, slug, args);
}

export async function composioGetMyInfo() {
  return executeLinkedInComposioTool("LINKEDIN_GET_MY_INFO", {});
}

/** Every post needs an author URN (urn:li:person:{id} for a personal
 *  profile, or urn:li:organization:{id} for a company Page — which one
 *  depends on which product the operator's Composio LinkedIn auth config
 *  was created for). Resolves the person id from LINKEDIN_GET_MY_INFO. */
export async function resolveAuthorUrn(explicitAuthorUrn?: string | null): Promise<string> {
  if (explicitAuthorUrn) return explicitAuthorUrn;
  const info: any = await composioGetMyInfo();
  const data = info?.data ?? info;
  const personId = data?.sub || data?.id || data?.person_id;
  if (!personId) throw new Error("Could not resolve the connected LinkedIn person id. Pass authorUrn explicitly, or reconnect LinkedIn in Integrations.");
  return `urn:li:person:${personId}`;
}

export async function composioPostUpdate(input: { text: string; authorUrn?: string | null; visibility?: "PUBLIC" | "CONNECTIONS" }) {
  const commentary = String(input.text || "").trim();
  if (!commentary) throw new Error("text is required");
  const author = await resolveAuthorUrn(input.authorUrn);
  const result = await executeLinkedInComposioTool("LINKEDIN_CREATE_LINKED_IN_POST", {
    author,
    commentary,
    visibility: input.visibility || "PUBLIC",
    lifecycleState: "PUBLISHED"
  });
  const data = (result as any)?.data ?? result;
  return { postUrn: data?.id || data?.data?.id || null, result };
}

export async function composioDeletePost(shareId: string) {
  return executeLinkedInComposioTool("LINKEDIN_DELETE_LINKED_IN_POST", { share_id: shareId });
}

export async function composioCommentOnPost(input: { actorUrn: string; postUrn: string; message: string }) {
  return executeLinkedInComposioTool("LINKEDIN_CREATE_COMMENT_ON_POST", {
    actor: input.actorUrn,
    object: input.postUrn,
    target_urn: input.postUrn,
    message: input.message
  });
}
