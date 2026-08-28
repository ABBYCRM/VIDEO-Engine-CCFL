import assert from "node:assert/strict";
import test from "node:test";
import { redactSecretPatterns } from "../../lib/coding-agent/secret-patterns.ts";

// Tests the pure pattern-redaction layer used by lib/coding-agent/secret-
// scrub.ts's scrubSecrets(). That wrapper also redacts this app's actual
// configured secrets via lib/db + lib/crypto, which pull in more of the app
// than plain `node --test` (no path-alias/loader support) can resolve — so
// this covers the dependency-free part directly.

test("redactSecretPatterns redacts Bearer tokens and known secret-shaped patterns", () => {
  const input = "curl -H 'Authorization: Bearer sk-abcDEF123456789012345' https://api.example.com";
  const out = redactSecretPatterns(input);
  assert.ok(!out.includes("sk-abcDEF123456789012345"), "raw bearer token must not survive scrubbing");
  assert.ok(out.includes("Bearer ***"));
});

test("redactSecretPatterns redacts a ve_live_ API token", () => {
  const out = redactSecretPatterns("Found stray token ve_live_abc123DEF456ghi789 in .env");
  assert.ok(!out.includes("ve_live_abc123DEF456ghi789"));
  assert.ok(out.includes("ve_live_"));
});

test("redactSecretPatterns leaves ordinary output untouched", () => {
  const input = "Running 12 tests...\nAll tests passed.\nexit code 0";
  assert.equal(redactSecretPatterns(input), input);
});
