// tests/unit/post-dedup-hash.test.ts
//
// lib/post-dedup.ts itself pulls in @/lib/db (unresolvable under raw
// `node --test` -- same constraint documented in
// tests/unit/aion-policy-completeness.test.ts). Its hashing logic has zero
// dependencies and lives in lib/post-dedup-hash.ts specifically so it can be
// exercised directly here.

import assert from "node:assert/strict";
import test from "node:test";
import { computePostHash } from "../../lib/post-dedup-hash.ts";

test("computePostHash is deterministic for identical input", () => {
  const a = computePostHash({ network: "instagram", contentType: "image", caption: "Hello world" });
  const b = computePostHash({ network: "instagram", contentType: "image", caption: "Hello world" });
  assert.equal(a, b);
});

test("computePostHash differs when network, contentType, or caption differ", () => {
  const base = computePostHash({ network: "instagram", contentType: "image", caption: "Hello world" });
  assert.notEqual(base, computePostHash({ network: "facebook", contentType: "image", caption: "Hello world" }));
  assert.notEqual(base, computePostHash({ network: "instagram", contentType: "video", caption: "Hello world" }));
  assert.notEqual(base, computePostHash({ network: "instagram", contentType: "image", caption: "Hello there" }));
});

test("computePostHash does not let field boundaries shift and collide", () => {
  // Without length-prefixing, ("ab","c") and ("a","bc") could hash the same
  // once joined -- this is exactly the ambiguity the length-prefix guards.
  const a = computePostHash({ network: "ab", contentType: "c", caption: "" });
  const b = computePostHash({ network: "a", contentType: "bc", caption: "" });
  assert.notEqual(a, b);
});

test("computePostHash treats a missing identity the same as an empty one", () => {
  const withUndefined = computePostHash({ network: "instagram", contentType: "image", caption: "x" });
  const withEmpty = computePostHash({ network: "instagram", contentType: "image", caption: "x", identity: "" });
  assert.equal(withUndefined, withEmpty);
});

test("computePostHash's identity component distinguishes otherwise-identical submissions (e.g. two different uploaded files with the same caption)", () => {
  const a = computePostHash({ network: "instagram", contentType: "creator-reel", caption: "same caption", identity: "filehash1" });
  const b = computePostHash({ network: "instagram", contentType: "creator-reel", caption: "same caption", identity: "filehash2" });
  assert.notEqual(a, b);
});
