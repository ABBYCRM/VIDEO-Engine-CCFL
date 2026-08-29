import assert from "node:assert/strict";
import test from "node:test";
import { withInstagramFallback } from "../../lib/claw/fallback.ts";

test("withInstagramFallback uses Composio first and does not call Graph after success", async () => {
  const calls: string[] = [];
  const result = await withInstagramFallback("ig_media_insights", {
    composio: async () => { calls.push("composio"); return { provider: "composio" }; },
    graph: async () => { calls.push("graph"); return { provider: "graph" }; }
  });

  assert.deepEqual(calls, ["composio"]);
  assert.equal(result.via, "composio");
  assert.deepEqual(result.data, { provider: "composio" });
  assert.equal(result.fallbackNote, undefined);
});

test("withInstagramFallback reports and uses direct Graph after a Composio error", async () => {
  const calls: string[] = [];
  const result = await withInstagramFallback("ig_send_dm", {
    composio: async () => { calls.push("composio"); throw new Error("managed action failed"); },
    graph: async () => { calls.push("graph"); return { sent: true }; }
  });

  assert.deepEqual(calls, ["composio", "graph"]);
  assert.equal(result.via, "instagram-mcp");
  assert.deepEqual(result.data, { sent: true });
  assert.match(result.fallbackNote || "", /Composio failed \(managed action failed\).*Graph/);
});

test("withInstagramFallback supports a direct-Graph-only configuration", async () => {
  const result = await withInstagramFallback("ig_list_conversations", {
    graph: async () => ["conversation-1"]
  });

  assert.equal(result.via, "instagram-mcp");
  assert.deepEqual(result.data, ["conversation-1"]);
  assert.match(result.fallbackNote || "", /Composio Instagram is not connected/);
});

test("withInstagramFallback preserves the Composio error when no Graph path exists", async () => {
  const expected = new Error("Composio permission denied");
  await assert.rejects(
    withInstagramFallback("ig_send_dm", { composio: async () => { throw expected; } }),
    (error) => error === expected
  );
});

test("withInstagramFallback rejects an empty provider map", async () => {
  await assert.rejects(
    withInstagramFallback("ig_media_insights", {}),
    /neither Composio Instagram nor official Graph/
  );
});
