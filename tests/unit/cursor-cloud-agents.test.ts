import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { executeClawTool, CLAW_TOOL_NAMES } from "../../lib/claw/tools.ts";
import { GET as collectionGet, POST as collectionPost } from "../../app/api/cursor/agents/route.ts";
import { GET as itemGet } from "../../app/api/cursor/agents/[id]/route.ts";
import { POST as replyPost } from "../../app/api/cursor/agents/[id]/reply/route.ts";
import { POST as cancelPost } from "../../app/api/cursor/agents/[id]/cancel/route.ts";
import {
  buildCursorBrief,
  compileLaunchBody,
  cursorApiBase,
  isCursorConfigured,
  launchCursorAgent,
  runCursorControl,
} from "../../lib/cursor/index.ts";

const originalFetch = globalThis.fetch;
const previousKey = process.env.CURSOR_API_KEY;
const previousBase = process.env.CURSOR_API_BASE_URL;
const TEST_KEY = "test-cursor-key-not-real";

const AGENT = {
  id: "bc-00000000-0000-0000-0000-000000000001",
  name: "Add Cursor control",
  status: "ACTIVE",
  url: "https://cursor.com/agents/bc-00000000-0000-0000-0000-000000000001",
  latestRunId: "run-00000000-0000-0000-0000-000000000001",
  repos: [{ url: "https://github.com/ABBYCRM/VIDEO-Engine-CCFL", startingRef: "main" }],
};
const RUN = {
  id: "run-00000000-0000-0000-0000-000000000001",
  agentId: AGENT.id,
  status: "CREATING",
  createdAt: "2026-09-12T00:00:00.000Z",
  updatedAt: "2026-09-12T00:00:00.000Z",
};

type Call = { method: string; url: string; auth: string; body: unknown };
const calls: Call[] = [];

function authExpected() {
  return `Basic ${Buffer.from(`${TEST_KEY}:`, "utf8").toString("base64")}`;
}

function mockCursor() {
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const href = String(url);
    const method = String(init?.method || "GET").toUpperCase();
    const headers = init?.headers as Record<string, string> | undefined;
    const auth = headers?.Authorization || "";
    let body: unknown = null;
    if (init?.body) {
      try { body = JSON.parse(String(init.body)); } catch { body = init.body; }
    }
    calls.push({ method, url: href, auth, body });
    if (auth !== authExpected()) {
      return Response.json({ error: { code: "unauthorized", message: "bad key" } }, { status: 401 });
    }
    if (method === "POST" && href.endsWith("/v1/agents")) {
      return Response.json({ agent: AGENT, run: RUN }, { status: 201 });
    }
    if (method === "GET" && href.includes("/v1/agents?") || (method === "GET" && href.endsWith("/v1/agents"))) {
      return Response.json({ items: [AGENT] });
    }
    if (method === "GET" && href.includes(`/v1/agents/${AGENT.id}/runs/${RUN.id}`)) {
      return Response.json({ ...RUN, status: "FINISHED", result: "Added Cursor control and tests." });
    }
    if (method === "GET" && href.endsWith(`/v1/agents/${AGENT.id}`)) {
      return Response.json(AGENT);
    }
    if (method === "POST" && href.endsWith(`/v1/agents/${AGENT.id}/runs`)) {
      return Response.json({ run: { ...RUN, id: "run-00000000-0000-0000-0000-000000000002", status: "CREATING" } }, { status: 201 });
    }
    if (method === "POST" && href.endsWith(`/v1/agents/${AGENT.id}/runs/${RUN.id}/cancel`)) {
      return Response.json({ id: RUN.id, status: "CANCELLED" });
    }
    if (method === "GET" && href.endsWith("/v1/me")) {
      return Response.json({ apiKeyName: "test", createdAt: "2026-09-12T00:00:00.000Z" });
    }
    return Response.json({ error: { code: "not_found", message: href } }, { status: 404 });
  }) as typeof fetch;
}

beforeEach(() => {
  calls.length = 0;
  process.env.CURSOR_API_KEY = TEST_KEY;
  delete process.env.CURSOR_API_BASE_URL;
  mockCursor();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (previousKey === undefined) delete process.env.CURSOR_API_KEY;
  else process.env.CURSOR_API_KEY = previousKey;
  if (previousBase === undefined) delete process.env.CURSOR_API_BASE_URL;
  else process.env.CURSOR_API_BASE_URL = previousBase;
});

describe("Cursor Cloud Agents client", () => {
  it("compiles a Grok-style brief with repo, criteria, and evidence rules", () => {
    const brief = buildCursorBrief({
      goal: "Add Cursor control",
      repo: "https://github.com/ABBYCRM/VIDEO-Engine-CCFL",
      successCriteria: ["routes exist", "mocked spawn→status"],
      context: "Claw-only strip",
    });
    assert.match(brief, /Add Cursor control/);
    assert.match(brief, /VIDEO-Engine-CCFL/);
    assert.match(brief, /routes exist/);
    assert.match(brief, /methodical-notes/);
    assert.match(brief, /No stubs/);
    const compiled = compileLaunchBody({ prompt: "Add Cursor control", repo: "https://github.com/ABBYCRM/VIDEO-Engine-CCFL" });
    assert.equal(compiled.ok, true);
    if (!compiled.ok) return;
    assert.equal((compiled.body.repos as { url: string }[])[0].url, "https://github.com/ABBYCRM/VIDEO-Engine-CCFL");
    assert.match(String((compiled.body.prompt as { text: string }).text), /Evidence rules/);
  });

  it("HOLD when CURSOR_API_KEY is missing — not a silent pass", async () => {
    delete process.env.CURSOR_API_KEY;
    assert.equal(isCursorConfigured(), false);
    const launched = await launchCursorAgent({ prompt: "x" });
    assert.equal(launched.ok, false);
    assert.equal(launched.trinity, "HOLD");
    assert.equal(launched.code, "MISSING_KEY");
    assert.match(launched.error || "", /CURSOR_API_KEY/);
    assert.ok(!JSON.stringify(launched).includes(TEST_KEY));
    assert.equal(calls.length, 0);
  });

  it("POSTs /v1/agents with Basic auth and never echoes the key", async () => {
    const launched = await launchCursorAgent({
      prompt: "Add Cursor control",
      repo: "https://github.com/ABBYCRM/VIDEO-Engine-CCFL",
      successCriteria: ["proof"],
    });
    assert.equal(launched.ok, true);
    assert.equal(launched.trinity, "GO");
    assert.equal(launched.agent?.id, AGENT.id);
    assert.equal(calls[0].method, "POST");
    assert.equal(calls[0].url, `${cursorApiBase()}/v1/agents`);
    assert.equal(calls[0].auth, authExpected());
    const dumped = JSON.stringify(launched);
    assert.ok(!dumped.includes(TEST_KEY));
    assert.ok(!dumped.includes(authExpected()));
  });
});

describe("tool → control → client chain (Grok Bot spawn→status→reply→cancel)", () => {
  it("exposes cursor_launch / cursor_status / cursor_reply / cursor_cancel", () => {
    for (const name of ["cursor_launch", "cursor_status", "cursor_reply", "cursor_cancel"]) {
      assert.ok(CLAW_TOOL_NAMES.includes(name), `missing tool ${name}`);
    }
  });

  it("executeClawTool(cursor_launch) hits POST /v1/agents", async () => {
    const result = await executeClawTool("cursor_launch", {
      prompt: "Wire Cursor like Grok Bot",
      repo: "https://github.com/ABBYCRM/VIDEO-Engine-CCFL",
      successCriteria: ["spawn", "status"],
    });
    assert.equal((result as { ok: boolean }).ok, true);
    assert.equal((result as { agent?: { id: string } }).agent?.id, AGENT.id);
    assert.equal(calls[0].url, "https://api.cursor.com/v1/agents");
    assert.equal(calls[0].method, "POST");
    assert.match(String((calls[0].body as { prompt: { text: string } }).prompt.text), /Wire Cursor like Grok Bot/);
  });

  it("routes use the same control module as tools", async () => {
    const spawnRes = await collectionPost(new Request("http://local/api/cursor/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "Scripted spawn", repo: "https://github.com/ABBYCRM/VIDEO-Engine-CCFL" }),
    }));
    assert.equal(spawnRes.status, 202);
    const spawnJson = await spawnRes.json();
    assert.equal(spawnJson.ok, true);
    assert.equal(spawnJson.agent.id, AGENT.id);

    const listRes = await collectionGet(new Request("http://local/api/cursor/agents"));
    assert.equal(listRes.status, 200);
    const listJson = await listRes.json();
    assert.equal(listJson.ok, true);
    assert.equal(listJson.agents[0].id, AGENT.id);

    const statusRes = await itemGet(new Request(`http://local/api/cursor/agents/${AGENT.id}`), { params: Promise.resolve({ id: AGENT.id }) });
    assert.equal(statusRes.status, 200);
    const statusJson = await statusRes.json();
    assert.equal(statusJson.agent.id, AGENT.id);
    assert.equal(statusJson.run.result, "Added Cursor control and tests.");

    const replyRes = await replyPost(new Request(`http://local/api/cursor/agents/${AGENT.id}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "Also add contract tests" }),
    }), { params: Promise.resolve({ id: AGENT.id }) });
    assert.equal(replyRes.status, 202);
    const replyJson = await replyRes.json();
    assert.equal(replyJson.run.id, "run-00000000-0000-0000-0000-000000000002");

    const cancelRes = await cancelPost(new Request(`http://local/api/cursor/agents/${AGENT.id}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }), { params: Promise.resolve({ id: AGENT.id }) });
    assert.equal(cancelRes.status, 200);
    const cancelJson = await cancelRes.json();
    assert.equal(cancelJson.ok, true);

    const viaTool = await executeClawTool("cursor_status", { id: AGENT.id });
    assert.equal((viaTool as { ok: boolean }).ok, true);

    assert.ok(calls.some((c) => c.method === "POST" && c.url.endsWith("/v1/agents")));
    assert.ok(calls.some((c) => c.method === "POST" && c.url.endsWith("/runs")));
    assert.ok(calls.some((c) => c.method === "POST" && c.url.endsWith("/cancel")));
  });

  it("collection POST without key returns 503 HOLD", async () => {
    delete process.env.CURSOR_API_KEY;
    const res = await collectionPost(new Request("http://local/api/cursor/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "should hold" }),
    }));
    assert.equal(res.status, 503);
    const json = await res.json();
    assert.equal(json.ok, false);
    assert.equal(json.trinity, "HOLD");
    assert.equal(json.code, "MISSING_KEY");
  });

  it("runCursorControl launch/status/reply/cancel is the shared chain", async () => {
    const launched = await runCursorControl({ op: "launch", prompt: "shared", repo: "https://github.com/ABBYCRM/VIDEO-Engine-CCFL" });
    assert.equal(launched.ok, true);
    const status = await runCursorControl({ op: "status", id: AGENT.id });
    assert.equal(status.ok, true);
    const reply = await runCursorControl({ op: "reply", id: AGENT.id, prompt: "steer" });
    assert.equal(reply.ok, true);
    const cancel = await runCursorControl({ op: "cancel", id: AGENT.id, runId: RUN.id });
    assert.equal(cancel.ok, true);
  });
});

describe("routes exist (contract)", () => {
  it("ships collection + id + reply + steer + cancel handlers", () => {
    const root = resolve(process.cwd());
    const files = [
      "app/api/cursor/agents/route.ts",
      "app/api/cursor/agents/[id]/route.ts",
      "app/api/cursor/agents/[id]/reply/route.ts",
      "app/api/cursor/agents/[id]/steer/route.ts",
      "app/api/cursor/agents/[id]/cancel/route.ts",
    ];
    for (const rel of files) {
      const abs = resolve(root, rel);
      assert.equal(existsSync(abs), true, rel);
      const src = readFileSync(abs, "utf8");
      assert.match(src, /export async function (GET|POST)/);
      assert.match(src, /runCursorControl/);
    }
  });
});

describe("Acts like Grok Bot — prompt + catalog excerpts", () => {
  it("system prompt teaches Cursor spawn and Grok Bot behavior", () => {
    const runtime = readFileSync(resolve(process.cwd(), "lib/claw/runtime.ts"), "utf8");
    assert.match(runtime, /ACT LIKE GROK BOT/);
    assert.match(runtime, /cursor_launch/);
    assert.match(runtime, /CURSOR_API_KEY/);
    assert.match(runtime, /methodical-notes/);
    assert.match(runtime, /Do NOT do heavy repo work inline/);
    assert.match(runtime, /Do NOT pick from a prefab agent list/);
    assert.match(runtime, /Trinity HOLD/);
    assert.match(runtime, /memory_search/);
    assert.match(runtime, /Never ask the operator to fix code/);
    assert.match(runtime, /Computer\/browser\/shell/);
  });

  it("tool catalog describes launch/status/reply/cancel", () => {
    const tools = readFileSync(resolve(process.cwd(), "lib/claw/tools.ts"), "utf8");
    assert.match(tools, /name: "cursor_launch"/);
    assert.match(tools, /name: "cursor_status"/);
    assert.match(tools, /name: "cursor_reply"/);
    assert.match(tools, /name: "cursor_cancel"/);
    assert.match(tools, /CURSOR_API_KEY/);
    assert.match(tools, /methodical-notes/);
  });

  it(".env.example documents the name only", () => {
    const env = readFileSync(resolve(process.cwd(), ".env.example"), "utf8");
    assert.match(env, /^CURSOR_API_KEY=$/m);
    assert.doesNotMatch(env, /CURSOR_API_KEY=\S/);
  });
});

const live = Boolean(previousKey?.trim());
describe("optional live smoke (skipped without CURSOR_API_KEY)", { skip: !live }, () => {
  it("GET /v1/me with the real key (no spawn)", async () => {
    globalThis.fetch = originalFetch;
    process.env.CURSOR_API_KEY = previousKey;
    const { cursorMe } = await import("../../lib/cursor/index.ts");
    const me = await cursorMe();
    assert.equal(me.ok, true, me.error || "live /v1/me failed");
    assert.ok(!JSON.stringify(me).includes(previousKey || "nope"));
  });
});
