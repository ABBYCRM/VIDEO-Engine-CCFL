import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { executeClawTool, CLAW_TOOL_NAMES } from "../../lib/claw/tools.ts";
import { aionBosMemory, aionRoutines, aionDecision } from "../../lib/claw/aion.ts";
import { POST as decisionPost } from "../../app/api/decision/route.ts";
import { GET as connectorsGet } from "../../app/api/connectors/route.ts";

const originalFetch = globalThis.fetch;
const previousUrl = process.env.AION_BASE_URL;
const previousKey = process.env.AION_API_KEY;
const AION_KEY = "test-only-key";

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
    if (method === "GET" && href.includes("/api/memory/bos")) {
      return Response.json({ ok: true, query: "Trinity", count: 1, chunks: [{ text: "Trinity Alpha Omega Praxis", authority: "canon" }], persist: "bos-omega.sqlite" });
    }
    if (method === "POST" && href.endsWith("/api/memory/bos")) {
      return Response.json({ ok: true, persist: "bos-omega.sqlite", authority: "continuity", chunk_count: 1 });
    }
    if (method === "GET" && href.endsWith("/api/routines")) {
      return Response.json({ ok: true, persist: "routines.sqlite", routines: [{ name: "trinity-gate", status: "active" }] });
    }
    if (method === "POST" && href.endsWith("/api/routines")) {
      return Response.json({ ok: true, persist: "routines.sqlite", routine: { name: (body as { name?: string })?.name, status: "active" } });
    }
    if (method === "POST" && href.includes("/pause")) {
      return Response.json({ ok: true, persist: "routines.sqlite", routine: { name: "trinity-gate", status: "paused" } });
    }
    if (method === "POST" && href.includes("/resume")) {
      return Response.json({ ok: true, persist: "routines.sqlite", routine: { name: "trinity-gate", status: "active" } });
    }
    if (method === "DELETE" && href.includes("/api/routines/")) {
      return Response.json({ ok: true, persist: "routines.sqlite", deleted: "trinity-gate" });
    }
    if (method === "POST" && href.endsWith("/api/decision")) {
      return Response.json({
        ok: true,
        trinity: "HOLD",
        reason: "retrieve_before_answer",
        reasons: ["retrieve_before_answer"],
        decision: { state: "COMMIT", score: 0.75, rationale: "ok" },
      });
    }
    return Response.json({ ok: true, source: "aion-brain" });
  }) as typeof fetch;
}

describe("first-class Brain BOS / routines / Trinity", () => {
  beforeEach(() => {
    calls.length = 0;
    process.env.AION_BASE_URL = "http://aion-brain:10000";
    process.env.AION_API_KEY = AION_KEY;
    mockBrain();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (previousUrl === undefined) delete process.env.AION_BASE_URL; else process.env.AION_BASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.AION_API_KEY; else process.env.AION_API_KEY = previousKey;
  });

  it("registers first-class tools", () => {
    for (const name of ["bos_memory", "routines", "trinity_decide", "connector_status"]) {
      assert.ok(CLAW_TOOL_NAMES.includes(name), name);
    }
  });

  it("bos_memory retrieves GET /api/memory/bos with X-AION-Key", async () => {
    const row = await executeClawTool("bos_memory", { query: "Trinity" });
    assert.equal((row as { ok?: boolean }).ok, true);
    assert.equal(calls[0].method, "GET");
    assert.equal(calls[0].url, "http://aion-brain:10000/api/memory/bos?q=Trinity&topK=6");
    assert.equal(calls[0].headers["X-AION-Key"], AION_KEY);
    assert.ok(!calls.some((c) => c.url.includes("api.cursor.com")));
  });

  it("bos_memory writes POST /api/memory/bos only when asked", async () => {
    const hold = await aionBosMemory({});
    assert.equal(hold.trinity, "HOLD");
    assert.equal(calls.length, 0);
    await executeClawTool("bos_memory", { query: "remember this", write: true });
    assert.equal(calls[0].method, "POST");
    assert.equal(calls[0].url, "http://aion-brain:10000/api/memory/bos");
    assert.deepEqual(calls[0].body, { text: "remember this", title: "operator-note" });
  });

  it("routines list/create/pause/resume/delete hit Brain RoutineStore", async () => {
    await executeClawTool("routines", { op: "list" });
    await executeClawTool("routines", { op: "create", name: "nightly", trigger: "morning" });
    await aionRoutines({ op: "pause", name: "trinity-gate" });
    await aionRoutines({ op: "resume", name: "trinity-gate" });
    await aionRoutines({ op: "delete", name: "trinity-gate" });
    assert.deepEqual(calls.map((c) => `${c.method} ${c.url}`), [
      "GET http://aion-brain:10000/api/routines",
      "POST http://aion-brain:10000/api/routines",
      "POST http://aion-brain:10000/api/routines/trinity-gate/pause",
      "POST http://aion-brain:10000/api/routines/trinity-gate/resume",
      "DELETE http://aion-brain:10000/api/routines/trinity-gate",
    ]);
  });

  it("trinity_decide and POST /api/decision proxy Brain", async () => {
    const tool = await executeClawTool("trinity_decide", { user_input: "Explain Trinity" });
    assert.equal((tool as { trinity?: string }).trinity, "HOLD");
    const res = await decisionPost(new Request("http://local/api/decision", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ user_input: "Explain Trinity" }),
    }));
    const json = await res.json();
    assert.equal(json.trinity, "HOLD");
    assert.ok(Array.isArray(json.reasons));
    assert.ok(calls.every((c) => c.url.startsWith("http://aion-brain:10000/api/decision") || c.url.includes("/api/memory") || c.url.includes("/api/routines") || c.url.endsWith("/api/decision")));
    const decideCalls = calls.filter((c) => c.url.endsWith("/api/decision"));
    assert.equal(decideCalls.length >= 2, true);
    assert.equal(decideCalls[0].headers["X-AION-Key"], AION_KEY);
  });

  it("Brain-missing HOLD without inventing a store", async () => {
    delete process.env.AION_BASE_URL;
    delete process.env.AION_API_KEY;
    const decision = await aionDecision({ user_input: "ship the PR" });
    assert.equal(decision.trinity, "HOLD");
    assert.equal(decision.code, "AION_UNCONFIGURED");
    assert.equal(calls.length, 0);
  });
});

describe("Files tray + connectors registry + runtime", () => {
  it("header and sidebar can open the Files drawer", () => {
    const src = readFileSync(resolve(process.cwd(), "components/claw-console.tsx"), "utf8");
    assert.match(src, /aria-label="Files"/);
    assert.match(src, /setFilesOpen\(true\)/);
    assert.match(src, /setFilesOpen\(\(v\) => !v\)/);
  });

  it("ships connectors + decision + routines routes and pages", () => {
    for (const rel of [
      "app/api/decision/route.ts",
      "app/api/routines/route.ts",
      "app/api/routines/[name]/pause/route.ts",
      "app/api/routines/[name]/resume/route.ts",
      "app/api/routines/[name]/route.ts",
      "app/api/connectors/route.ts",
      "app/routines/page.tsx",
      "components/routines-console.tsx",
      "components/connectors-panel.tsx",
    ]) {
      assert.equal(existsSync(resolve(process.cwd(), rel)), true, rel);
    }
  });

  it("GET /api/connectors returns configured vs missing without secrets", async () => {
    const res = await connectorsGet();
    const json = await res.json();
    assert.equal(json.ok, true);
    assert.ok(Array.isArray(json.connectors));
    assert.ok(json.connectors.some((c: { id: string }) => c.id === "composio"));
    assert.ok(json.connectors.some((c: { id: string }) => c.id === "aion"));
    assert.equal(JSON.stringify(json).includes("sk-"), false);
  });

  it("runtime retrieves BOS, routines, and trinity_decide", () => {
    const runtime = readFileSync(resolve(process.cwd(), "lib/claw/runtime.ts"), "utf8");
    assert.match(runtime, /call bos_memory FIRST/);
    assert.match(runtime, /\/api\/memory\/bos/);
    assert.match(runtime, /call routines/);
    assert.match(runtime, /trinity_decide/);
    assert.match(runtime, /POST \/api\/decision/);
  });
});
