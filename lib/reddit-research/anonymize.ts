// Hard anonymization boundary for the Reddit market-research pipeline.
// Reddit content flows into an NVIDIA model call to synthesize aggregate
// engagement themes. Per operator directive this must never surface a
// specific person, username, or verbatim post/comment in anything that
// reaches a model or a published caption — Florida Bar Rule 4-7.18 bars
// targeted solicitation of accident victims, so nothing here may be
// traceable back to an identifiable individual or post.
//
// This is enforced structurally (callers must build text from only the
// fields this module returns — never pass `author`/`author_fullname`/
// `permalink` through) AND textually (this function strips anything that
// still looks like a handle, mention, permalink, email, or phone number
// out of whatever text does get included), so a stray "thanks u/xyz" or a
// pasted phone number inside a post body still gets scrubbed even if a
// caller forgets the structural rule.

const USERNAME_MENTION = /\/?u\/[A-Za-z0-9_-]{3,20}/gi;
const SUBREDDIT_LINK = /\/?r\/[A-Za-z0-9_]{2,21}\/comments\/\S*/gi; // full permalink, not the bare "r/name"
const URL = /https?:\/\/\S+/gi;
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const PHONE = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;

export function anonymizeText(input: string | null | undefined): string {
  let t = String(input || "");
  t = t.replace(SUBREDDIT_LINK, "[link removed]");
  t = t.replace(URL, "[link removed]");
  t = t.replace(USERNAME_MENTION, "[user removed]");
  t = t.replace(EMAIL, "[contact removed]");
  t = t.replace(PHONE, "[contact removed]");
  return t.trim();
}

export type AnonymizedPost = {
  title: string;
  body: string;
  subreddit: string;
  score: number;
  numComments: number;
};

export type AnonymizedComment = {
  body: string;
  score: number;
};

/** Structural boundary: only pull the fields we intend to ever use from a
 *  raw Composio Reddit API object, then anonymize their text. Anything not
 *  named here (author, author_fullname, permalink, id) never leaves this
 *  function, regardless of what the raw API response contains. */
export function anonymizePost(raw: Record<string, unknown>): AnonymizedPost {
  return {
    title: anonymizeText(String(raw.title || "")).slice(0, 300),
    body: anonymizeText(String(raw.selftext || raw.body || "")).slice(0, 1000),
    subreddit: String(raw.subreddit || "").replace(/^\/?r\//, "").slice(0, 50),
    score: Number(raw.score) || 0,
    numComments: Number(raw.num_comments ?? raw.numComments) || 0
  };
}

export function anonymizeComment(raw: Record<string, unknown>): AnonymizedComment {
  return {
    body: anonymizeText(String(raw.body || "")).slice(0, 600),
    score: Number(raw.score) || 0
  };
}
