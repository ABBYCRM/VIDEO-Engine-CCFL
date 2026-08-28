// Reddit distribution, via Composio's Reddit toolkit. "reddit" is registered
// as a Composio toolkit in lib/composio/client.ts and listed in the
// Integrations catalog (lib/integrations/composio.ts) — this file adds the
// actual posting/reading actions.
//
// Tool slugs below are Composio's real Reddit toolkit action names
// (verified against Composio's toolkit documentation): REDDIT_CREATE_REDDIT_POST,
// REDDIT_POST_REDDIT_COMMENT, REDDIT_RETRIEVE_POST_COMMENTS,
// REDDIT_GET_SUBREDDITS_SEARCH.

import { executeComposioTool, getActiveConnectedAccountId, isComposioConfigured } from "@/lib/composio/client";

const TOOLKIT = "reddit";

export function isRedditComposioConnected(): boolean {
  return isComposioConfigured() && Boolean(getActiveConnectedAccountId(TOOLKIT));
}

export async function executeRedditComposioTool(slug: string, args: Record<string, unknown>) {
  return executeComposioTool(TOOLKIT, slug, args);
}

export async function composioSubmitPost(input: { subreddit: string; title: string; text?: string; url?: string; flairId?: string }) {
  const subreddit = String(input.subreddit || "").trim().replace(/^r\//, "");
  const title = String(input.title || "").trim().slice(0, 300);
  if (!subreddit || !title) throw new Error("subreddit and title are required");
  const kind = input.url ? "link" : "self";
  const args: Record<string, unknown> = { subreddit, title, kind };
  if (input.url) args.url = input.url;
  else args.text = String(input.text || "").slice(0, 40000);
  if (input.flairId) args.flair_id = input.flairId;
  const result = await executeRedditComposioTool("REDDIT_CREATE_REDDIT_POST", args);
  const data = (result as any)?.data ?? result;
  return { postId: data?.id || data?.name || null, result };
}

export async function composioListComments(articleId: string) {
  return executeRedditComposioTool("REDDIT_RETRIEVE_POST_COMMENTS", { article: articleId.replace(/^t3_/, "") });
}

export async function composioReplyComment(thingId: string, text: string) {
  return executeRedditComposioTool("REDDIT_POST_REDDIT_COMMENT", { thing_id: thingId, text: String(text).slice(0, 10000) });
}

export async function composioSearchSubreddits(query: string) {
  return executeRedditComposioTool("REDDIT_GET_SUBREDDITS_SEARCH", { q: query });
}
