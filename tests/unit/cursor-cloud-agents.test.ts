import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { executeClawTool, CLAW_TOOL_NAMES } from "../../lib/claw/tools.ts";
import { aionCursorLaunch, aionCursorStatus, aionCursorReply, aionCursorCancel } from "../../lib/claw/aion.ts";
import { POST as launchPost } from "../../app/api/cursor/launch/route.ts";
import { GET as itemGet } from "../../app/api/cursor/[id]/route.ts";
import { POST as replyPost } from "../../app/api/cursor/[id]/reply/route.ts";
import { POST as cancelPost } from "../../app/api/cursor/[id]/cancel/route.ts";
import { isCursorProxyReady, runCursorControl } from "../../lib/cursor/index.ts";
import { createAdminSession, SESSION_COOKIE } from "../../lib/auth.ts";

const originalFetch = globalThis.fetch;
const previousUrl = process.env.AION_BASE_URL;
const previousKey = process.env.AION_API_KEY;
const previousCursor = process.env.CURSOR_API_KEY;
const AION_KEY = "test-only-key";
const AGENT_ID = "bc-00000000-0000-0000-0000-000000000001";

type Call = { method: string; url: string; headers: Record<string, string>; body: unknown };
const calls: Call[] = [];

function mockBrain() {
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const href = String(url);
    const method = String(init?.method || "GET").toUpperCase();
    const headers = (init?.headers || {}) as Record<string, string>;
    let body: unknown = null;
    if (init?.body) {
      try { body = JSON.parse(String(init.body)); } catch { body = init.body; }
    }
    calls.push({ method, url: href, headers, body });
    if (headers["X-AION-Key"] !== AION_KEY) {
      return Response.json({ detail: "unauthorized" }, { status: 401 });
    }
    if (href.includes("api.cursor.com")) {
      return Response.json({ error: "ccfl_must_not_call_cursor_api" }, { status: 599 });
    }
    if (method === "POST" && href.endsWith("/api/cursor/launch")) {
      return Response.json({
        ok: true,
        source: "aion-brain",
        tool: "cursor_launch",
        evidence: { agent: { id: AGENT_ID, status: "ACTIVE" }, run: { id: "run-1", status: "CREATING" } },
      }, { status: 202 });
    }
    if (method === "GET" && href.includes(`/api/cursor/${AGENT_ID}`)) {
      return Response.json({
        ok: true,
        source: "aion-brain",
        tool: "cursor_status",
        evidence: { agent: { id: AGENT_ID, latestRunId: "run-1" }, run: { id: "run-1", status: "FINISHED", result: "landed" } },
      });
    }
    if (method === "POST" && href.endsWith(`/api/cursor/${AGENT_ID}/reply`)) {
      return Response.json({
        ok: true,
        source: "aion-brain",
        tool: "cursor_reply",
        evidence: { agent: { id: AGENT_ID }, run: { id: "run-2", status: "CREATING" } },
      }, { status: 202 });
    }
    if (method === "POST" && href.endsWith(`/api/cursor/${AGENT_ID}/cancel`)) {
      return Response.json({
        ok: true,
        source: "aion-brain",
        tool: "cursor_cancel",
        evidence: { agent: { id: AGENT_ID }, run: { id: "run-1", status: "CANCELLED" } },
      });
    }
    if (method === "POST" && href.endsWith("/api/cursor/launch") === false && href.includes("/api/cursor/launch") === false) {
      /* continue */
    }
    return Response.json({ ok: false, error: "not_found", path: href }, { status: 404 });
  }) as typeof fetch;
}

function authed(url: string, init: RequestInit = {}) {
  process.env.SESSION_SECRET ||= "e2e-session-secret-that-is-long-enough-for-tests-123456";
  process.env.ADMIN_PASSWORD ||= "e2e-local-only";
  const { token } = createAdminSession();
  const headers = new Headers(init.headers);
  headers.set("Cookie", `${SESSION_COOKIE}=${token}`);
  return new Request(url, { ...init, headers });
}

beforeEach(() => {
  calls.length = 0;
  process.env.AION_BASE_URL = "http://aion-brain:10000";
  process.env.AION_API_KEY = AION_KEY;
  process.env.SESSION_SECRET ||= "e2e-session-secret-that-is-long-enough-for-tests-123456";
  process.env.ADMIN_PASSWORD ||= "e2e-local-only";
  delete process.env.CURSOR_API_KEY;
  mockBrain();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (previousUrl === undefined) delete process.env.AION_BASE_URL; else process.env.AION_BASE_URL = previousUrl;
  if (previousKey === undefined) delete process.env.AION_API_KEY; else process.env.AION_API_KEY = previousKey;
  if (previousCursor === undefined) delete process.env.CURSOR_API_KEY; else process.env.CURSOR_API_KEY = previousCursor;
});

describe("CCFL → Brain cursor proxy (authoritative)", () => {
  it("HOLD when Aion handshake is missing — does not call Cursor", async () => {
    delete process.env.AION_BASE_URL;
    delete process.env.AION_API_KEY;
    assert.equal(isCursorProxyReady(), false);
    const launched = await aionCursorLaunch({ prompt: "x" });
    assert.equal(launched.ok, false);
    assert.equal(launched.trinity, "HOLD");
    assert.equal(launched.code, "AION_UNCONFIGURED");
    assert.equal(launched.owner, "aion-brain");
    assert.equal(calls.length, 0);
  });

  it("cursor_launch tool forwards to Brain POST /api/cursor/launch with X-AION-Key", async () => {
    const result = await executeClawTool("cursor_launch", {
      prompt: "Wire Cursor via Brain",
      repo: "https://github.com/ABBYCRM/VIDEO-Engine-CCFL",
    });
    const row = result as { ok: boolean; source?: string; evidence?: { agent?: { id: string } } };
    assert.equal(row.ok, true);
    assert.equal(row.source, "aion-brain");
    assert.equal(row.evidence?.agent?.id, AGENT_ID);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "http://aion-brain:10000/api/cursor/launch");
    assert.equal(calls[0].method, "POST");
    assert.equal(calls[0].headers["X-AION-Key"], AION_KEY);
    assert.equal((calls[0].body as { prompt: string }).prompt, "Wire Cursor via Brain");
    assert.equal((calls[0].body as { repository: string }).repository, "https://github.com/ABBYCRM/VIDEO-Engine-CCFL");
    assert.ok(!calls[0].url.includes("api.cursor.com"));
    assert.ok(!JSON.stringify(calls[0].headers).includes("CURSOR_API_KEY"));
  });

  it("routes proxy launch → status → reply → cancel to Brain", async () => {
    const anonymous = await launchPost(new Request("http://local/api/cursor/launch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "no auth" }),
    }));
    assert.equal(anonymous.status, 401);

    const spawn = await launchPost(authed("http://local/api/cursor/launch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "Scripted spawn", repo: "https://github.com/ABBYCRM/VIDEO-Engine-CCFL" }),
    }));
    assert.equal(spawn.status, 202);
    const spawnJson = await spawn.json();
    assert.equal(spawnJson.ok, true);
    assert.equal(spawnJson.source, "aion-brain");

    const status = await itemGet(authed(`http://local/api/cursor/${AGENT_ID}`), { params: Promise.resolve({ id: AGENT_ID }) });
    assert.equal(status.status, 200);
    assert.equal((await status.json()).evidence.run.result, "landed");

    const reply = await replyPost(authed(`http://local/api/cursor/${AGENT_ID}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "steer" }),
    }), { params: Promise.resolve({ id: AGENT_ID }) });
    assert.equal(reply.status, 202);

    const cancel = await cancelPost(authed(`http://local/api/cursor/${AGENT_ID}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }), { params: Promise.resolve({ id: AGENT_ID }) });
    assert.equal(cancel.status, 200);

    assert.ok(calls.every((c) => c.url.startsWith("http://aion-brain:10000/api/cursor")));
    assert.ok(calls.every((c) => !c.url.includes("api.cursor.com")));
  });

  it("Brain unconfigured key becomes Trinity HOLD (not a silent pass)", async () => {
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      calls.push({ method: "POST", url: String(url), headers: (init?.headers || {}) as Record<string, string>, body: null });
      return Response.json({ ok: false, error: "cursor_launch_unconfigured", env: "CURSOR_API_KEY", tool: "cursor_launch" }, { status: 400 });
    }) as typeof fetch;
    const result = await runCursorControl({ op: "launch", prompt: "x" });
    assert.equal(result.ok, false);
    assert.equal(result.trinity, "HOLD");
    assert.equal(result.code, "MISSING_KEY");
    assert.equal(result.env, "CURSOR_API_KEY");
  });

  it("direct aionCursor* helpers hit Brain paths", async () => {
    assert.equal((await aionCursorLaunch({ prompt: "p", repo: "https://github.com/ABBYCRM/VIDEO-Engine-CCFL" })).ok, true);
    assert.equal((await aionCursorStatus({ id: AGENT_ID })).ok, true);
    assert.equal((await aionCursorReply({ id: AGENT_ID, prompt: "more" })).ok, true);
    assert.equal((await aionCursorCancel({ id: AGENT_ID })).ok, true);
  });
});

describe("tools and routes exist", () => {
  it("exposes cursor_* and shell_run", () => {
    for (const name of ["cursor_launch", "cursor_status", "cursor_reply", "cursor_cancel", "shell_run"]) {
      assert.ok(CLAW_TOOL_NAMES.includes(name), `missing ${name}`);
    }
  });

  it("ships Brain-shaped proxy routes", () => {
    const files = [
      "app/api/cursor/launch/route.ts",
      "app/api/cursor/route.ts",
      "app/api/cursor/[id]/route.ts",
      "app/api/cursor/[id]/reply/route.ts",
      "app/api/cursor/[id]/cancel/route.ts",
    ];
    for (const rel of files) {
      const abs = resolve(process.cwd(), rel);
      assert.equal(existsSync(abs), true, rel);
      const src = readFileSync(abs, "utf8");
      assert.match(src, /aionCursor|Aion-Brain/);
      assert.match(src, /unauthorized|requireAdmin/);
      assert.doesNotMatch(src, /api\.cursor\.com/);
    }
    assert.equal(existsSync(resolve(process.cwd(), "lib/cursor/cloud-agents.ts")), false);
  });
});

describe("Acts like Grok Bot + Cursor via Brain — excerpts", () => {
  it("system prompt teaches ask-Brain cursor_launch", () => {
    const runtime = readFileSync(resolve(process.cwd(), "lib/claw/runtime.ts"), "utf8");
    assert.match(runtime, /ACT LIKE GROK BOT/);
    assert.match(runtime, /ASK AION-BRAIN to cursor_launch/);
    assert.match(runtime, /POST \/api\/cursor\/launch/);
    assert.match(runtime, /shell_run/);
    assert.match(runtime, /computer_open/);
    assert.match(runtime, /do not invent a local Cursor client/i);
  });

  it("tool catalog says Brain owns Cursor", () => {
    const tools = readFileSync(resolve(process.cwd(), "lib/claw/tools.ts"), "utf8");
    assert.match(tools, /Ask Aion-Brain to spawn a Cursor cloud agent/);
    assert.match(tools, /POST \/api\/cursor\/launch/);
    assert.match(tools, /name: "shell_run"/);
  });

  it(".env.example documents CURSOR_API_KEY name only for co-host", () => {
    const env = readFileSync(resolve(process.cwd(), ".env.example"), "utf8");
    assert.match(env, /^CURSOR_API_KEY=$/m);
    assert.doesNotMatch(env, /CURSOR_API_KEY=\S/);
    assert.match(env, /Brain-owned/);
  });
});
