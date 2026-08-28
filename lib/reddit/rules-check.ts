// Reddit self-promotion rules are enforced per-subreddit by human moderators,
// not reliably by any API. This is a pre-submit reminder, not an automated
// compliance gate — Reddit posting always defaults to manual approval
// (see the auto_post override below) precisely because this can't be fully
// automated.

export type RedditRulesReminder = {
  subreddit: string;
  reminder: string;
  requiresManualApproval: true;
};

export function redditPreSubmitReminder(subreddit: string): RedditRulesReminder {
  const clean = subreddit.replace(/^r\//, "");
  return {
    subreddit: clean,
    reminder: `Before posting to r/${clean}: check that subreddit's self-promotion rules (many require a minimum karma/account age, a specific flair, or ban business accounts outright). This app cannot verify subreddit-specific rules automatically — confirm manually before submitting.`,
    requiresManualApproval: true
  };
}

/** Reddit rows should never auto-post regardless of the global calendar
 *  auto_post setting — always force manual approval for this network. */
export function forceManualApprovalForReddit(network: string, requestedAutoPost: boolean): boolean {
  if (network === "reddit") return false;
  return requestedAutoPost;
}
