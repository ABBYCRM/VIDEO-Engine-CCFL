import assert from "node:assert/strict";
import test from "node:test";
import { formatInstagramToolError } from "../../lib/instagram-errors.ts";

test("formatInstagramToolError explains Meta code 100/subcode 33", () => {
  const error = new Error('INSTAGRAM_GET_IG_MEDIA_COMMENTS: {"error":{"message":"","type":"IGApiException","code":100,"error_subcode":33,"fbtrace_id":"trace"}}');
  const message = formatInstagramToolError("INSTAGRAM_GET_IG_MEDIA_COMMENTS", error);

  assert.match(message, /Meta denied access to this media/);
  assert.match(message, /code 100, subcode 33/);
  assert.match(message, /Business\/Creator account that owns the media/);
  assert.match(message, /instagram_manage_comments/);
});

test("formatInstagramToolError preserves useful ordinary errors and scrubs secrets", () => {
  const message = formatInstagramToolError(
    "INSTAGRAM_GET_IG_MEDIA_COMMENTS",
    new Error("request failed: https://graph.facebook.com/x?access_token=EAAsecretvalue&limit=10 Bearer private-token")
  );

  assert.match(message, /request failed/);
  assert.doesNotMatch(message, /EAAsecretvalue/);
  assert.doesNotMatch(message, /private-token/);
});
