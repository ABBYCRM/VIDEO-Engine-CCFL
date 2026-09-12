import assert from "node:assert/strict";
import test from "node:test";
import { searchDevSkills, searchDevSkillsReranked } from "../../lib/claw/dev-skills.ts";

// Isolate from any Bitdeer/NVIDIA/embeddings env vars that may be set in the
// calling shell. The stage-2 reranker is dynamically imported; if any of these
// env vars are present, `isRerankConfigured()` returns true and the rerank
// path runs (silently passing the test's "must fall back" assertion). Match
// the pattern used by tests/unit/aion.test.ts and tests/unit/grok-parity-gaps.test.ts.
const RERANK_ENV_KEYS = [
  "BITDEER_API_KEY", "BITDEER_API_KEYS",
  "NVIDIA_API_KEY", "NVIDIA_API_KEYS",
  "EMBEDDINGS_API_KEY",
] as const;
const previousRerankEnv: Record<string, string | undefined> = {};
for (const k of RERANK_ENV_KEYS) previousRerankEnv[k] = process.env[k];
for (const k of RERANK_ENV_KEYS) delete process.env[k];
test.after(() => {
  for (const k of RERANK_ENV_KEYS) {
    const prev = previousRerankEnv[k];
    if (prev === undefined) delete process.env[k];
    else process.env[k] = prev;
  }
});

// Note: these tests exercise dev-skills.ts, which is self-contained. The
// stage-2 NVIDIA reranker (lib/nvidia/rerank.ts) is loaded via a dynamic
// import and is NOT reachable under `node --test` (the repo's source uses
// bundler-resolved `@/` + extensionless imports). That's intentional
// coverage: it proves the pipeline degrades to the stage-1 keyword order
// instead of throwing when the reranker can't run — the same path taken in
// local dev when NVIDIA_API_KEY is absent.

test("stage-1 keyword search finds the idempotency record for a lexical query", () => {
  const hits = searchDevSkills("idempotency key retry", { limit: 5 });
  assert.ok(hits.some((s) => s.id === "idempotency"), "expected the idempotency record in keyword hits");
});

test("reranked search returns matches and never throws when the reranker can't run", async () => {
  const res = await searchDevSkillsReranked("make a POST safe to retry so a payment is not charged twice", { limit: 3 });
  assert.ok(res.matches.length > 0, "expected at least one match");
  assert.ok(res.matches.length <= 3, "must respect the limit");
  // Reranker unreachable here, so we expect the keyword fallback + a note.
  assert.equal(res.reranked, false);
  // With no vector DB reachable under `node --test`, stage-1 must fall back
  // to keyword retrieval rather than reporting a vector path.
  assert.equal(res.retrieval, "keyword");
  assert.ok(typeof res.note === "string" && res.note.length > 0, "fallback should explain itself");
});

test("reranked search widens a starved category filter so candidates still surface", async () => {
  // A query that lives in one category but is asked under another must not
  // return empty — stage 1 drops the filter to keep recall up.
  const res = await searchDevSkillsReranked("goroutine channel select", { category: "pattern", limit: 3 });
  assert.ok(res.matches.length > 0, "expected the filter to widen rather than starve");
});

test("reranked search honors an empty query by returning catalog order", async () => {
  const res = await searchDevSkillsReranked("", { category: "pattern", limit: 4 });
  assert.equal(res.reranked, false);
  assert.equal(res.matches.length, 4);
  assert.ok(res.matches.every((s) => s.category === "pattern"));
});
