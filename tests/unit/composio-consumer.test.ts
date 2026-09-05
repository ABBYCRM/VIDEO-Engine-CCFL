import test from "node:test";
import assert from "node:assert/strict";
import { isConsumerKey, listConsumerTools, callConsumerTool } from "../../lib/composio/consumer.ts";

const key = "ck_test_fixture_not_a_real_key";

test("consumer key detection leaves project keys on their existing path", () => {
  assert.equal(isConsumerKey("  ck_example  "), true);
  assert.equal(isConsumerKey("project-example"), false);
});

test("MCP discovery initializes, uses consumer header, and follows pagination", async t => {
  const methods: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string | URL, init: RequestInit) => {
    assert.equal(String(url), "https://connect.composio.dev/mcp");
    const headers = new Headers(init.headers);
    assert.equal(headers.get("x-consumer-api-key"), key);
    assert.equal(headers.has("x-api-key"), false);
    assert.equal(init.redirect, "error");
    if (init.method === "GET") return new Response(null, { status: 405 });
    const request = JSON.parse(String(init.body));
    methods.push(request.method);
    if (request.id === undefined) return new Response(null, { status: 202 });
    let result;
    if (request.method === "initialize") result = { protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "fixture", version: "1" } };
    else {
      assert.equal(request.method, "tools/list");
      result = request.params?.cursor === "next"
        ? { tools: [{ name: "EXECUTE", inputSchema: { type: "object" } }] }
        : { tools: [{ name: "SEARCH", inputSchema: { type: "object" } }], nextCursor: "next" };
    }
    return Response.json({ jsonrpc: "2.0", id: request.id, result });
  });
  assert.deepEqual((await listConsumerTools(key)).map(t => t.name), ["SEARCH", "EXECUTE"]);
  assert.deepEqual(methods, ["initialize", "notifications/initialized", "tools/list", "tools/list"]);
});

test("MCP action forwards exact name and arguments and preserves tool errors without retry", async t => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    if (init.method === "GET") return new Response(null, { status: 405 });
    const request = JSON.parse(String(init.body));
    if (request.id === undefined) return new Response(null, { status: 202 });
    let result;
    if (request.method === "initialize") result = { protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "fixture", version: "1" } };
    else {
      calls++;
      assert.equal(request.method, "tools/call");
      assert.deepEqual(request.params, { name: "SEARCH", arguments: { query: "github" } });
      result = { isError: true, content: [{ type: "text", text: "Connection required" }] };
    }
    return Response.json({ jsonrpc: "2.0", id: request.id, result });
  });
  const result = await callConsumerTool(key, "SEARCH", { query: "github" });
  assert.equal(result.isError, true);
  assert.equal(calls, 1);
});

test("authentication failure is propagated without exposing the key", async t => {
  t.mock.method(globalThis, "fetch", async () => new Response(`Rejected ${key}`, { status: 401 }));
  await assert.rejects(listConsumerTools(key), error => {
    assert.ok(error instanceof Error);
    assert.equal(error.message.includes(key), false);
    assert.match(error.message, /401/);
    return true;
  });
});
