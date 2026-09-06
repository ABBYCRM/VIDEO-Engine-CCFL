import assert from "node:assert/strict";
import test from "node:test";
import { arxivSearch, parseArxivAtom } from "../../lib/claw/arxiv.ts";
import { gdyApiBase, gdyKeys, gdySearch, gdyRagContext, gdyCategories, gdyTools, isGdyConfigured } from "../../lib/claw/gdy.ts";

const KEY = "gdy_test_primary_not_real";
const ALT = "gdy_test_alt_not_real";

function withGdyEnv(run: () => Promise<void> | void) {
  const prev = {
    GDY_BASE_URL: process.env.GDY_BASE_URL,
    GDY_API_BASE: process.env.GDY_API_BASE,
    GDY_API_KEY: process.env.GDY_API_KEY,
    GDY_API_KEY_ALT: process.env.GDY_API_KEY_ALT
  };
  return async () => {
    try {
      await run();
    } finally {
      for (const [k, v] of Object.entries(prev)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  };
}

test("GDY is unconfigured and fail-soft without keys", withGdyEnv(async () => {
  delete process.env.GDY_BASE_URL;
  delete process.env.GDY_API_BASE;
  delete process.env.GDY_API_KEY;
  delete process.env.GDY_API_KEY_ALT;
  assert.equal(isGdyConfigured(), false);
  const result = await gdySearch("subject");
  assert.equal(result.ok, false);
  assert.equal("code" in result && result.code, "MISSING_KEY");
  assert.ok(!JSON.stringify(result).includes(KEY));
}));

test("GDY_API_BASE wins over GDY_BASE_URL and search uses Bearer + /search?q=", withGdyEnv(async () => {
  process.env.GDY_BASE_URL = "https://gdy.example";
  process.env.GDY_API_BASE = "https://gdy.example/v1";
  process.env.GDY_API_KEY = KEY;
  delete process.env.GDY_API_KEY_ALT;
  assert.equal(gdyApiBase(), "https://gdy.example/v1");
  assert.deepEqual(gdyKeys(), [KEY]);
  assert.equal(isGdyConfigured(), true);

  const seen: { url: string; auth: string | null }[] = [];
  const prevFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    seen.push({ url: String(url), auth: new Headers(init?.headers).get("authorization") });
    return Response.json({ hits: [{ title: "ok" }] });
  }) as typeof fetch;
  try {
    const result = await gdySearch("docket");
    assert.equal(result.ok, true);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].url, "https://gdy.example/v1/search?q=docket");
    assert.equal(seen[0].auth, `Bearer ${KEY}`);
    assert.ok(!JSON.stringify(result).includes(KEY));
  } finally {
    globalThis.fetch = prevFetch;
  }
}));

test("GDY 401 on primary retries GDY_API_KEY_ALT and redacts keys", withGdyEnv(async () => {
  process.env.GDY_API_BASE = "https://gdy.example/v1";
  process.env.GDY_API_KEY = KEY;
  process.env.GDY_API_KEY_ALT = ALT;
  const auths: string[] = [];
  const prevFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: string | URL, init?: RequestInit) => {
    const auth = new Headers(init?.headers).get("authorization") || "";
    auths.push(auth);
    if (auth === `Bearer ${KEY}`) return new Response(`denied ${KEY}`, { status: 401 });
    return Response.json({ context: "rag" });
  }) as typeof fetch;
  try {
    const result = await gdyRagContext("entity");
    assert.equal(result.ok, true);
    assert.deepEqual(auths, [`Bearer ${KEY}`, `Bearer ${ALT}`]);
    const dumped = JSON.stringify(result);
    assert.ok(!dumped.includes(KEY));
    assert.ok(!dumped.includes(ALT));
  } finally {
    globalThis.fetch = prevFetch;
  }
}));

test("GDY categories and tools are GET catalog calls", withGdyEnv(async () => {
  process.env.GDY_API_BASE = "https://gdy.example/v1";
  process.env.GDY_API_KEY = KEY;
  const urls: string[] = [];
  const prevFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL) => {
    urls.push(String(url));
    return Response.json({ items: [] });
  }) as typeof fetch;
  try {
    assert.equal((await gdyCategories()).ok, true);
    assert.equal((await gdyTools()).ok, true);
    assert.deepEqual(urls, ["https://gdy.example/v1/categories", "https://gdy.example/v1/tools"]);
  } finally {
    globalThis.fetch = prevFetch;
  }
}));

test("arXiv parser extracts Atom entries and search hits the export API", async () => {
  const xml = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/1234.5678</id>
    <title>Example Paper</title>
    <summary>A short abstract.</summary>
    <published>2026-01-01T00:00:00Z</published>
    <author><name>Ada Lovelace</name></author>
  </entry>
</feed>`;
  assert.deepEqual(parseArxivAtom(xml), [{
    id: "http://arxiv.org/abs/1234.5678",
    title: "Example Paper",
    summary: "A short abstract.",
    published: "2026-01-01T00:00:00Z",
    authors: ["Ada Lovelace"]
  }]);

  const prevFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL) => {
    assert.match(String(url), /^https:\/\/export\.arxiv\.org\/api\/query\?search_query=/);
    assert.match(String(url), /all%3Atransformers/);
    return new Response(xml, { status: 200, headers: { "content-type": "application/atom+xml" } });
  }) as typeof fetch;
  try {
    const result = await arxivSearch("transformers", 5);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.via, "arxiv");
      assert.equal(result.count, 1);
      assert.equal(result.papers[0].title, "Example Paper");
    }
  } finally {
    globalThis.fetch = prevFetch;
  }
});
