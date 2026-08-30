import assert from "node:assert/strict";
import test from "node:test";
import { anonymizeText, anonymizePost, anonymizeComment } from "../../lib/reddit-research/anonymize.ts";

test("anonymizeText strips usernames, permalinks, emails, and phone numbers", () => {
  const out = anonymizeText(
    "Thanks u/throwaway123 and /u/another_user, see https://reddit.com/r/legaladvice/comments/abc123/title/ " +
    "or email me at real.person@example.com or call 561-566-1360."
  );
  assert.ok(!out.includes("throwaway123"));
  assert.ok(!out.includes("another_user"));
  assert.ok(!out.includes("reddit.com"));
  assert.ok(!out.includes("real.person@example.com"));
  assert.ok(!out.includes("561-566-1360"));
});

test("anonymizePost only carries title/body/subreddit/score/numComments — never author fields", () => {
  const raw = {
    title: "Got hit by a car crossing the street, thanks u/legal_helper_99",
    selftext: "My contact is 555-123-4567",
    subreddit: "legaladvice",
    score: 42,
    num_comments: 7,
    author: "real_username_should_never_appear",
    author_fullname: "t2_abc123",
    permalink: "/r/legaladvice/comments/xyz/title/"
  };
  const out = anonymizePost(raw);
  const serialized = JSON.stringify(out);
  assert.ok(!serialized.includes("real_username_should_never_appear"));
  assert.ok(!serialized.includes("author_fullname") && !serialized.includes("t2_abc123"));
  assert.ok(!serialized.includes("555-123-4567"));
  assert.ok(!out.body.includes("legal_helper_99"));
  assert.equal(out.subreddit, "legaladvice");
  assert.equal(out.score, 42);
  assert.equal(out.numComments, 7);
  assert.equal(Object.keys(out).sort().join(","), "body,numComments,score,subreddit,title");
});

test("anonymizeComment only carries body/score — never author fields", () => {
  const raw = { body: "u/some_user said this happened to them too", score: 3, author: "some_user" };
  const out = anonymizeComment(raw);
  assert.equal(Object.keys(out).sort().join(","), "body,score");
  assert.ok(!out.body.includes("some_user"));
});
