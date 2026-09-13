import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { connectorInventory } from "../../lib/claw/connectors.ts";
import {
  youtubeSearch, youtubeVideo, llmGemini, llmXai, llmKimi,
  openaiChat, openaiEmbed, pineconeQuery, pineconeUpsert, hedraStart, hedraJob
} from "../../lib/claw/business.ts";
import { executeClawTool, CLAW_TOOL_NAMES, toolsCatalog } from "../../lib/claw/tools.ts";
import { GET as connectorsGet } from "../../app/api/connectors/route.ts";
import { classifyComposioKey, composioProjectGate } from "../../lib/composio/consumer.ts";

const KEYS = {
  YOUTUBE_API_KEY: "yt_test_key_not_real",
  GEMINI_API_KEY: "gem_test_key_not_real",
  XAI_API_KEY: "xai_test_key_not_real",
  KIMI_API_KEY: "kimi_test_key_not_real",
  OPENAI_API_KEY: "sk-test-openai-not-real",
  OPENAI_EMBEDDINGS_API_KEY: "sk-test-embed-not-real",
  PINECONE_API_KEY: "pc_test_key_not_real",
  PINECONE_INDEX_HOST: "test-index.svc.aped-123.pinecone.io",
  HEDRA_API_KEY: "hedra_test_key_not_real"
};

const ENV_NAMES = [
  "YOUTUBE_API_KEY", "GEMINI_API_KEY", "XAI_API_KEY", "KIMI_API_KEY", "KIMI_BASE_URL",
  "OPENAI_API_KEY", "OPENAI_EMBEDDINGS_API_KEY", "OPENAI_EMBEDDINGS",
  "PINECONE_API_KEY", "PINECONE_INDEX_HOST", "PINECONE_HOST", "PINECONE_INDEX",
  "HEDRA_API_KEY"
] as const;

const saved: Record<string, string | undefined> = {};
const originalFetch = globalThis.fetch;
type Seen = { method: string; url: string; headers: Record<string, string>; body: unknown };
const seen: Seen[] = [];

function headerMap(init?: RequestInit): Record<string, string> {
  const out: Record<string, string> = {};
  new Headers(init?.headers).forEach((v, k) => { out[k.toLowerCase()] = v; });
  return out;
}

function noLeak(value: unknown) {
  const text = JSON.stringify(value);
  for (const [name, key] of Object.entries(KEYS)) {
    if (name === "PINECONE_INDEX_HOST") continue;
    assert.equal(text.includes(key), false, `leaked ${name}`);
  }
}

describe("business connectors e2e (mock HTTP)", () => {
  beforeEach(() => {
    seen.length = 0;
    for (const name of ENV_NAMES) {
      saved[name] = process.env[name];
      delete process.env[name];
    }
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    for (const name of ENV_NAMES) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  });

  it("registers every business tool and teaches existing scrapers/search/shell", () => {
    for (const name of [
      "youtube_search", "youtube_video", "gemini_generate", "xai_chat", "kimi_chat",
      "openai_chat", "openai_embed", "pinecone_query", "pinecone_upsert",
      "hedra_start", "hedra_job", "hedra_status", "connector_status",
      "steel_scrape", "firecrawl_scrape", "scrapingbee_scrape", "scrapfly_scrape",
      "web_search", "web_screenshot", "e2b_run", "shell_run", "resend_send", "github_request",
      "composio_health", "composio_list_tools", "composio_action"
    ]) {
      assert.ok(CLAW_TOOL_NAMES.includes(name), name);
    }
    const catalog = toolsCatalog();
    assert.match(catalog, /youtube_search/);
    assert.match(catalog, /gemini_generate/);
    assert.match(catalog, /xai_chat/);
    assert.match(catalog, /kimi_chat/);
    assert.equal(CLAW_TOOL_NAMES.includes("llm_gemini"), false);
    assert.equal(CLAW_TOOL_NAMES.includes("llm_xai"), false);
    assert.equal(CLAW_TOOL_NAMES.includes("llm_kimi"), false);
    assert.match(catalog, /pinecone_query/);
    assert.match(catalog, /hedra_start/);
    assert.match(catalog, /steel_scrape/);
    assert.match(catalog, /web_search/);
    assert.match(catalog, /e2b_run/);
    assert.match(catalog, /resend_send/);
    assert.match(catalog, /github_request/);
  });

  it("connector_status inventory lists every business key with a when string", () => {
    const inv = connectorInventory();
    for (const id of ["youtube", "gemini", "xai", "kimi", "openai", "pinecone", "hedra", "composio", "steel", "exa", "e2b", "resend", "github", "bitdeer", "nvidia"]) {
      assert.ok(id in inv, id);
      assert.equal(typeof (inv as Record<string, { when?: string }>)[id].when, "string");
      assert.ok(((inv as Record<string, { when?: string }>)[id].when || "").length > 10, id);
    }
    assert.match(inv.youtube.when, /youtube_search/);
    assert.match(inv.gemini.when, /gemini_generate/);
    assert.match(inv.gemini.when, /OPTIONAL/);
    assert.match(inv.xai.when, /xai_chat/);
    assert.match(inv.kimi.when, /kimi_chat/);
    assert.match(inv.bitdeer.when, /PRIMARY/);
    assert.match(inv.nvidia.when, /PRIMARY/);
    assert.match(inv.openai.when, /openai_embed/);
    assert.match(inv.pinecone.when, /pinecone_query/);
    assert.match(inv.hedra.when, /hedra_start/);
    assert.match(inv.composio.when, /ak_/);
    assert.match(inv.composio.when, /email/i);
    noLeak(inv);
  });

  it("system prompt teaches business wiring and existing scrapers", () => {
    const runtime = readFileSync(resolve(process.cwd(), "lib/claw/runtime.ts"), "utf8");
    assert.match(runtime, /Business wiring/);
    assert.match(runtime, /YOUTUBE_API_KEY → youtube_search/);
    assert.match(runtime, /Claw runtime is Bitdeer/);
    assert.match(runtime, /from "@\/lib\/nvidia\/client"/);
    assert.match(runtime, /chatCompletionStream/);
    assert.match(runtime, /GEMINI_API_KEY → gemini_generate/);
    assert.match(runtime, /XAI_API_KEY → xai_chat/);
    assert.match(runtime, /KIMI_API_KEY → kimi_chat/);
    assert.match(runtime, /OPTIONAL alternate/);
    assert.match(runtime, /OPENAI_API_KEY/);
    assert.match(runtime, /PINECONE_API_KEY → pinecone_query/);
    assert.match(runtime, /HEDRA_API_KEY → hedra_status \/ hedra_start/);
    assert.match(runtime, /COMPOSIO_API_KEY \(ak_\)/);
    assert.match(runtime, /steel_scrape/);
    assert.match(runtime, /web_search/);
    assert.match(runtime, /web_screenshot/);
    assert.match(runtime, /e2b_run/);
    assert.match(runtime, /resend_send/);
    assert.match(runtime, /github_request/);
    assert.match(runtime, /ak_ project keys are live/);
    assert.match(runtime, /Email and GitHub go through Composio/);
  });

  it("fail-soft MISSING_KEY for every new tool and never leaks a fixture key", async () => {
    const rows = [
      await youtubeSearch({ q: "test" }),
      await youtubeVideo({ id: "abcdefghijk" }),
      await llmGemini({ prompt: "hi" }),
      await llmXai({ prompt: "hi" }),
      await llmKimi({ prompt: "hi" }),
      await openaiChat({ prompt: "hi" }),
      await openaiEmbed({ text: "hi" }),
      await pineconeQuery({ text: "hi" }),
      await pineconeUpsert({ id: "n1", text: "hi" }),
      await hedraStart({ prompt: "a cat" }),
      await hedraJob({ jobId: "job-1" })
    ];
    for (const row of rows) {
      assert.equal(row.ok, false);
      assert.equal("code" in row && row.code, "MISSING_KEY");
      noLeak(row);
    }
  });

  it("youtube_search / youtube_video call Data API v3 with the key as a query param", async () => {
    process.env.YOUTUBE_API_KEY = KEYS.YOUTUBE_API_KEY;
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      const href = String(url);
      seen.push({ method: String(init?.method || "GET"), url: href, headers: headerMap(init), body: null });
      if (href.includes("/search")) {
        return Response.json({ items: [{ id: { videoId: "abc123XYZ00", kind: "youtube#video" }, snippet: { title: "Clip", channelTitle: "Ch", publishedAt: "2026-01-01", description: "d" } }] });
      }
      return Response.json({ items: [{ id: "abc123XYZ00", snippet: { title: "Clip", channelTitle: "Ch", description: "d" }, contentDetails: { duration: "PT8S" }, statistics: { viewCount: "9" } }] });
    }) as typeof fetch;
    const search = await executeClawTool("youtube_search", { q: "explainer" });
    assert.equal((search as { ok?: boolean }).ok, true);
    assert.equal((search as { results: Array<{ videoId: string }> }).results[0].videoId, "abc123XYZ00");
    assert.ok(seen[0].url.startsWith("https://www.googleapis.com/youtube/v3/search"));
    assert.ok(seen[0].url.includes("key=" + KEYS.YOUTUBE_API_KEY));
    const video = await executeClawTool("youtube_video", { id: "abc123XYZ00" });
    assert.equal((video as { ok?: boolean }).ok, true);
    assert.ok(seen[1].url.includes("/youtube/v3/videos"));
    noLeak(search);
    noLeak(video);
  });

  it("gemini_generate / xai_chat / kimi_chat / openai_chat hit the real provider URLs", async () => {
    process.env.GEMINI_API_KEY = KEYS.GEMINI_API_KEY;
    process.env.XAI_API_KEY = KEYS.XAI_API_KEY;
    process.env.KIMI_API_KEY = KEYS.KIMI_API_KEY;
    process.env.OPENAI_API_KEY = KEYS.OPENAI_API_KEY;
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      const href = String(url);
      let body: unknown = null;
      if (init?.body) { try { body = JSON.parse(String(init.body)); } catch { body = init.body; } }
      seen.push({ method: String(init?.method || "GET"), url: href, headers: headerMap(init), body });
      if (href.includes("generativelanguage.googleapis.com")) {
        assert.equal(headerMap(init)["x-goog-api-key"], KEYS.GEMINI_API_KEY);
        return Response.json({ candidates: [{ content: { parts: [{ text: "gemini-ok" }] } }] });
      }
      if (href.includes("api.x.ai/v1/chat/completions")) {
        assert.equal(headerMap(init)["authorization"], `Bearer ${KEYS.XAI_API_KEY}`);
        return Response.json({ choices: [{ message: { content: "xai-ok" } }] });
      }
      if (href.includes("api.moonshot.ai/v1/chat/completions")) {
        assert.equal(headerMap(init)["authorization"], `Bearer ${KEYS.KIMI_API_KEY}`);
        return Response.json({ choices: [{ message: { content: "kimi-ok" } }] });
      }
      if (href.includes("api.openai.com/v1/chat/completions")) {
        assert.equal(headerMap(init)["authorization"], `Bearer ${KEYS.OPENAI_API_KEY}`);
        return Response.json({ choices: [{ message: { content: "openai-ok" } }] });
      }
      return Response.json({ error: "unexpected" }, { status: 599 });
    }) as typeof fetch;
    const gemini = await executeClawTool("gemini_generate", { prompt: "hi" });
    const xai = await executeClawTool("xai_chat", { prompt: "hi" });
    const kimi = await executeClawTool("kimi_chat", { prompt: "hi" });
    const openai = await executeClawTool("openai_chat", { prompt: "hi" });
    assert.equal((gemini as { text?: string }).text, "gemini-ok");
    assert.equal((xai as { text?: string }).text, "xai-ok");
    assert.equal((kimi as { text?: string }).text, "kimi-ok");
    assert.equal((openai as { text?: string }).text, "openai-ok");
    assert.ok(seen.some((c) => c.url.includes("generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent")));
    assert.ok(seen.some((c) => c.url === "https://api.x.ai/v1/chat/completions"));
    assert.ok(seen.some((c) => c.url === "https://api.moonshot.ai/v1/chat/completions"));
    assert.ok(seen.some((c) => c.url === "https://api.openai.com/v1/chat/completions"));
    noLeak(gemini); noLeak(xai); noLeak(kimi); noLeak(openai);
  });

  it("openai_embed uses OPENAI_EMBEDDINGS_API_KEY when present", async () => {
    process.env.OPENAI_API_KEY = KEYS.OPENAI_API_KEY;
    process.env.OPENAI_EMBEDDINGS_API_KEY = KEYS.OPENAI_EMBEDDINGS_API_KEY;
    globalThis.fetch = (async (_url: string | URL, init?: RequestInit) => {
      seen.push({ method: "POST", url: String(_url), headers: headerMap(init), body: null });
      assert.equal(headerMap(init)["authorization"], `Bearer ${KEYS.OPENAI_EMBEDDINGS_API_KEY}`);
      return Response.json({ data: [{ embedding: [0.1, 0.2, 0.3] }] });
    }) as typeof fetch;
    const row = await executeClawTool("openai_embed", { text: "chunk" });
    assert.equal((row as { ok?: boolean }).ok, true);
    assert.deepEqual((row as { vector: number[] }).vector, [0.1, 0.2, 0.3]);
    assert.equal(seen[0].url, "https://api.openai.com/v1/embeddings");
    noLeak(row);
  });

  it("pinecone_query lists indexes without a vector and queries when host+vector are set", async () => {
    process.env.PINECONE_API_KEY = KEYS.PINECONE_API_KEY;
    process.env.PINECONE_INDEX_HOST = KEYS.PINECONE_INDEX_HOST;
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      const href = String(url);
      let body: unknown = null;
      if (init?.body) { try { body = JSON.parse(String(init.body)); } catch { body = init.body; } }
      seen.push({ method: String(init?.method || "GET"), url: href, headers: headerMap(init), body });
      assert.equal(headerMap(init)["api-key"], KEYS.PINECONE_API_KEY);
      if (href === "https://api.pinecone.io/indexes") {
        return Response.json({ indexes: [{ name: "bos", host: KEYS.PINECONE_INDEX_HOST, dimension: 1536 }] });
      }
      if (href === `https://${KEYS.PINECONE_INDEX_HOST}/query`) {
        return Response.json({ matches: [{ id: "n1", score: 0.9 }] });
      }
      return Response.json({ error: "unexpected" }, { status: 599 });
    }) as typeof fetch;
    const listed = await executeClawTool("pinecone_query", {});
    assert.equal((listed as { mode?: string }).mode, "list-indexes");
    const queried = await executeClawTool("pinecone_query", { vector: [0.1, 0.2], topK: 3 });
    assert.equal((queried as { mode?: string }).mode, "query");
    assert.deepEqual((seen[1].body as { vector: number[]; topK: number }).vector, [0.1, 0.2]);
    noLeak(listed); noLeak(queried);
  });

  it("pinecone_upsert posts vectors/upsert and does not invent a BOS store", async () => {
    process.env.PINECONE_API_KEY = KEYS.PINECONE_API_KEY;
    process.env.PINECONE_INDEX_HOST = KEYS.PINECONE_INDEX_HOST;
    process.env.OPENAI_API_KEY = KEYS.OPENAI_API_KEY;
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      const href = String(url);
      let body: unknown = null;
      if (init?.body) { try { body = JSON.parse(String(init.body)); } catch { body = init.body; } }
      seen.push({ method: String(init?.method || "GET"), url: href, headers: headerMap(init), body });
      if (href.includes("/embeddings")) return Response.json({ data: [{ embedding: [1, 2] }] });
      if (href.endsWith("/vectors/upsert")) return Response.json({ upsertedCount: 1 });
      return Response.json({ error: "unexpected" }, { status: 599 });
    }) as typeof fetch;
    const row = await executeClawTool("pinecone_upsert", { id: "note-1", text: "remember Trinity" });
    assert.equal((row as { ok?: boolean }).ok, true);
    assert.equal((row as { id?: string }).id, "note-1");
    assert.ok(seen.some((c) => c.url === `https://${KEYS.PINECONE_INDEX_HOST}/vectors/upsert`));
    noLeak(row);
  });

  it("hedra_start and hedra_job use Authorization Key and the v3 job lifecycle", async () => {
    process.env.HEDRA_API_KEY = KEYS.HEDRA_API_KEY;
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      const href = String(url);
      let body: unknown = null;
      if (init?.body) { try { body = JSON.parse(String(init.body)); } catch { body = init.body; } }
      seen.push({ method: String(init?.method || "GET"), url: href, headers: headerMap(init), body });
      assert.equal(headerMap(init)["authorization"], `Key ${KEYS.HEDRA_API_KEY}`);
      if (href === "https://api.hedra.com/v3/models/gpt-image-2" && init?.method === "POST") {
        return Response.json({ job_id: "job_abc", status_url: "https://api.hedra.com/v3/jobs/job_abc/status" }, { status: 202 });
      }
      if (href === "https://api.hedra.com/v3/jobs/job_abc/status") {
        return Response.json({ status: "COMPLETED" });
      }
      if (href === "https://api.hedra.com/v3/jobs/job_abc") {
        return Response.json({ outputs: [{ url: "https://cdn.example/out.png" }] });
      }
      return Response.json({ error: "unexpected" }, { status: 599 });
    }) as typeof fetch;
    const started = await executeClawTool("hedra_start", { prompt: "a space cat" });
    assert.equal((started as { ok?: boolean }).ok, true);
    assert.equal((started as { jobId?: string }).jobId, "job_abc");
    assert.deepEqual((seen[0].body as { input: { prompt: string } }).input.prompt, "a space cat");
    const job = await executeClawTool("hedra_job", { jobId: "job_abc" });
    assert.equal((job as { status?: string }).status, "COMPLETED");
    assert.ok((job as { result?: { outputs?: unknown[] } }).result);
    noLeak(started); noLeak(job);
  });

  it("GET /api/connectors is open; inventory still lists business rows without secrets", async () => {
    const res = await connectorsGet();
    assert.notEqual(res.status, 401);
    const inventory = connectorInventory();
    const rows = inventory as Record<string, { when?: string; role?: string }>;
    for (const id of ["youtube", "gemini", "xai", "kimi", "openai", "pinecone", "hedra", "composio", "steel", "bitdeer", "nvidia"]) {
      assert.ok(rows[id], id);
    }
    assert.match(String(inventory.youtube.when), /youtube_search/);
    assert.equal(inventory.bitdeer.role, "primary");
    noLeak(inventory);
    assert.equal(JSON.stringify(inventory).includes("sk-"), false);
  });

  it("composio ak_ stays live; oak_ remains optional / not live", () => {
    assert.equal(classifyComposioKey("ak_project"), "project");
    assert.equal(composioProjectGate("project").ok, true);
    const org = composioProjectGate("organization");
    assert.equal(org.ok, false);
    if (org.ok === false) assert.match(org.error, /oak_/);
  });

  it("connector_status tool returns the expanded inventory", async () => {
    const row = await executeClawTool("connector_status", {});
    assert.equal((row as { ok?: boolean }).ok, true);
    const connectors = (row as { connectors: Record<string, { when: string }> }).connectors;
    assert.ok(connectors.youtube.when);
    assert.ok(connectors.gemini.when);
    assert.ok(connectors.pinecone.when);
    assert.match(connectors.bitdeer.when, /PRIMARY/);
    noLeak(row);
  });

  it("app_status names Bitdeer as the live Claw brain", async () => {
    const row = await executeClawTool("app_status", {});
    const status = row as { clawBrain?: { provider?: string; role?: string }; external?: { bitdeer?: { role?: string } } };
    assert.equal(status.clawBrain?.provider, "bitdeer");
    assert.equal(status.clawBrain?.role, "primary");
    assert.match(String(status.external?.bitdeer?.role || ""), /primary/i);
    noLeak(row);
  });
});
