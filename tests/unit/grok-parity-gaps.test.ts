import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { executeClawTool, CLAW_TOOL_NAMES } from "../../lib/claw/tools.ts";

const originalFetch = globalThis.fetch;
const previousUrl = process.env.AION_BASE_URL;
const previousKey = process.env.AION_API_KEY;
const AION_KEY = "test-only-key";

type Call = { url: string; headers: Record<string, string>; body: unknown };
const calls: Call[] = [];

function mockBrain() {
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const href = String(url);
    const headers = (init?.headers || {}) as Record<string, string>;
    let body: unknown = null;
    if (init?.body) {
      try { body = JSON.parse(String(init.body)); } catch { body = init.body; }
    }
    calls.push({ url: href, headers, body });
    if (headers["X-AION-Key"] !== AION_KEY) {
      return Response.json({ detail: "unauthorized" }, { status: 401 });
    }
    if (href.includes("api.cursor.com")) {
      return Response.json({ error: "ccfl_must_not_call_cursor_api" }, { status: 599 });
    }
    return Response.json({ ok: true, source: "aion-brain", tool: "n8n_aura", evidence: { id: "n8n-1" } });
  }) as typeof fetch;
}

describe("grok-parity gaps: bos_memory + routines", () => {
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
    assert.ok(CLAW_TOOL_NAMES.includes("bos_memory"));
    assert.ok(CLAW_TOOL_NAMES.includes("routines"));
  });

  it("bos_memory searches n8n_aura memory_search with X-AION-Key", async () => {
    const row = await executeClawTool("bos_memory", { query: "Trinity GO HOLD ABORT" });
    assert.equal((row as { ok?: boolean }).ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "http://aion-brain:10000/api/tools/n8n_aura");
    assert.equal(calls[0].headers["X-AION-Key"], AION_KEY);
    assert.deepEqual(calls[0].body, { name: "memory_search", payload: { query: "Trinity GO HOLD ABORT", q: "Trinity GO HOLD ABORT" } });
    assert.ok(!calls.some((c) => c.url.includes("api.cursor.com")));
  });

  it("bos_memory writes only when asked", async () => {
    const hold = await executeClawTool("bos_memory", {});
    assert.equal((hold as { trinity?: string }).trinity, "HOLD");
    assert.equal(calls.length, 0);
    await executeClawTool("bos_memory", { query: "remember this", write: true });
    assert.deepEqual(calls[0].body, { name: "memory_write", payload: { text: "remember this" } });
  });

  it("routines list/schedule/cancel forward to documented n8n_aura names", async () => {
    await executeClawTool("routines", { op: "list" });
    await executeClawTool("routines", { op: "schedule", text: "ping Brain every morning" });
    await executeClawTool("routines", { op: "cancel", id: "task-1" });
    assert.deepEqual(calls.map((c) => (c.body as { name: string }).name), [
      "list_scheduled_tasks",
      "schedule_task",
      "cancel_scheduled_task",
    ]);
    assert.ok(calls.every((c) => c.url === "http://aion-brain:10000/api/tools/n8n_aura"));
    const bad = await executeClawTool("routines", { op: "schedule" });
    assert.equal((bad as { trinity?: string }).trinity, "HOLD");
  });
});

describe("grok-parity gaps: Files tray + runtime", () => {
  it("header and sidebar can open the Files drawer", () => {
    const src = readFileSync(resolve(process.cwd(), "components/claw-console.tsx"), "utf8");
    assert.match(src, /aria-label="Files"/);
    assert.match(src, /setFilesOpen\(true\)/);
    assert.match(src, /setFilesOpen\(\(v\) => !v\)/);
    assert.match(src, /<FolderOpen/);
  });

  it("runtime retrieves BOS and routines before inventing", () => {
    const runtime = readFileSync(resolve(process.cwd(), "lib/claw/runtime.ts"), "utf8");
    assert.match(runtime, /call bos_memory/);
    assert.match(runtime, /call routines/);
    assert.match(runtime, /Do not invent BOS facts/);
    assert.match(runtime, /Do not invent a local cron/);
  });

  it("bos_memory stays in the read-only tool set", () => {
    const src = readFileSync(resolve(process.cwd(), "lib/claw/execution.ts"), "utf8");
    assert.match(src, /"bos_memory"/);
  });
});
