// X / Twitter distribution, via Composio's Twitter toolkit. Composio already
// registers "twitter" as a real toolkit with OAuth auth-config tracking and
// connected-account sync (lib/composio/client.ts) — this file adds the
// actual posting/reading actions, which is the part that didn't exist yet.
//
// Tool slugs below are Composio's real Twitter toolkit action names
// (verified against Composio's toolkit documentation), not guessed:
// TWITTER_CREATION_OF_A_POST, TWITTER_POST_DELETE_BY_POST_ID,
// TWITTER_POST_LOOKUP_BY_POST_ID, TWITTER_RECENT_SEARCH.

import { executeComposioTool, getActiveConnectedAccountId, isComposioConfigured } from "@/lib/composio/client";

const TOOLKIT = "twitter";

export function isXComposioConnected(): boolean {
  return isComposioConfigured() && Boolean(getActiveConnectedAccountId(TOOLKIT));
}

export async function executeXComposioTool(slug: string, args: Record<string, unknown>) {
  return executeComposioTool(TOOLKIT, slug, args);
}

/**
 * Post a tweet. mediaUrl is accepted for interface parity with the other
 * network adapters, but is not wired yet: attaching media requires first
 * calling Composio's TWITTER_UPLOAD_MEDIA / TWITTER_UPLOAD_LARGE_MEDIA
 * actions to get a media_id, and this app has not verified those actions'
 * exact upload parameter contract — rather than guess it, text-only posting
 * is fully supported now and media attachment is a follow-up, not silently
 * dropped.
 */
export async function composioPostTweet(input: { text: string; mediaUrl?: string | null; replyToTweetId?: string | null }) {
  if (input.mediaUrl) throw new Error("X media attachments are not wired yet (requires verifying Composio's media upload action contract). Post text-only for now.");
  const text = String(input.text || "").trim();
  if (!text) throw new Error("text is required");
  // Reject rather than silently slice: every Calendar caption (any network,
  // including X) has the operator-locked legal disclaimer force-appended by
  // ensureBrandContactInCaption() before it ever reaches here. Truncating to
  // 280 chars would routinely cut that disclaimer off the end with no
  // signal to the operator — surfacing the error lets them shorten the body
  // instead of posting a legally incomplete tweet.
  if (text.length > 280) throw new Error(`Tweet text is ${text.length} chars, over X's 280-char limit. Shorten the caption (the required disclaimer footer counts toward this) and try again.`);
  const args: Record<string, unknown> = { text };
  if (input.replyToTweetId) args.reply = { in_reply_to_tweet_id: input.replyToTweetId };
  const result = await executeXComposioTool("TWITTER_CREATION_OF_A_POST", args);
  const data = (result as any)?.data ?? result;
  return { tweetId: data?.data?.id || data?.id || null, result };
}

export async function composioReplyTweet(tweetId: string, text: string) {
  return composioPostTweet({ text, replyToTweetId: tweetId });
}

export async function composioDeleteTweet(tweetId: string) {
  return executeXComposioTool("TWITTER_POST_DELETE_BY_POST_ID", { id: tweetId });
}

export async function composioGetTweet(tweetId: string) {
  return executeXComposioTool("TWITTER_POST_LOOKUP_BY_POST_ID", { id: tweetId });
}

/** X has no dedicated "list my mentions" action confirmed in this app's
 *  research; mentions are approximated with a recent search for the handle,
 *  which is a verified, documented Twitter toolkit action. */
export async function composioSearchRecentTweets(query: string) {
  return executeXComposioTool("TWITTER_RECENT_SEARCH", { query });
}

export async function composioListMentions(handle: string) {
  const cleanHandle = handle.replace(/^@/, "");
  return composioSearchRecentTweets(`@${cleanHandle}`);
}
