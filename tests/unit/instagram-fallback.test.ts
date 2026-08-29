import assert from "node:assert/strict";
import test from "node:test";
import { withInstagramFallback } from "../../lib/claw/fallback.ts";

test("withInstagramFallback keeps Graph primary when it succeeds", async () => {
  let composioCalls = 0;
  const result = await withInstagramFallback(
    "ig_get_comments",
    async () => ({ data: [{ id: "comment-1" }] }),
    async () => { composioCalls += 1; return { data: [] }; }
  );

  assert.equal(result.via, "instagram-mcp");
  assert.equal(composioCalls, 0);
  assert.deepEqual(result.data, { data: [{ id: "comment-1" }] });
});

test("withInstagramFallback uses Composio and reports why Graph failed", async () => {
  const result = await withInstagramFallback(
    "ig_get_comments",
    async () => { throw new Error("Graph token is not configured"); },
    async () => ({ data: [{ id: "comment-2" }] })
  );

  assert.equal(result.via, "composio");
  assert.deepEqual(result.data, { data: [{ id: "comment-2" }] });
  assert.match(result.fallbackNote || "", /Graph token is not configured/);
  assert.match(result.fallbackNote || "", /Used Composio/);
});

test("withInstagramFallback preserves both connector failures", async () => {
  await assert.rejects(
    withInstagramFallback(
      "ig_get_comments",
      async () => { throw new Error("Graph token is not configured"); },
      async () => { throw new Error("Meta denied access to this media (code 100, subcode 33)"); }
    ),
    /Graph token is not configured.*Meta denied access to this media \(code 100, subcode 33\)/
  );
});
