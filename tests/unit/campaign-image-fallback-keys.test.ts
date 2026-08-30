// tests/unit/campaign-image-fallback-keys.test.ts
//
// lib/campaign-image.ts pulls in @/lib/db (via @/lib/avatar-generation/client
// and others), unresolvable under raw `node --test` -- same constraint
// documented in tests/unit/aion-policy-completeness.test.ts. This checks the
// source text directly instead of importing the module.
//
// Regression coverage for a real bug found 2026-08-30: renderWithConfiguredProvider's
// fallback chain (added the same day) called each fallback provider's
// adapter (editWithGemini, generateA2eGptImage, editWithOpenAI, renderWithXai)
// without an explicit API key, so they all fell through to getImageApiKey()
// -- which returns the key for whatever provider is CURRENTLY CONFIGURED,
// not the one actually being attempted. In practice this meant every
// fallback attempt except Hedra (which resolves its own key directly via
// getProviderKey("hedra")) authenticated with the wrong provider's key and
// was guaranteed to fail with a 401, silently defeating the entire point of
// the fallback chain. The fix threads getImageApiKeyForProvider(provider)
// through each fallback call explicitly.

import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(__dirname, "../../lib/campaign-image.ts"), "utf8");

function fallbackBlock(): string {
  const start = source.indexOf("const fallbacks:");
  const end = source.indexOf("for (const fb of fallbacks)");
  if (start === -1 || end === -1) throw new Error("could not locate the fallbacks array in lib/campaign-image.ts");
  return source.slice(start, end);
}

test("the gemini fallback resolves its own key via getImageApiKeyForProvider, not getImageApiKey()", () => {
  const block = fallbackBlock();
  const geminiLine = block.split("\n").find((l) => l.includes('provider: "gemini"'));
  assert.ok(geminiLine, "expected a gemini entry in the fallback chain");
  assert.match(geminiLine!, /getImageApiKeyForProvider\("gemini"\)/);
});

test("the a2e fallback resolves its own key via getImageApiKeyForProvider, not getImageApiKey()", () => {
  const block = fallbackBlock();
  const a2eLine = block.split("\n").find((l) => l.includes('provider: "a2e"'));
  assert.ok(a2eLine, "expected an a2e entry in the fallback chain");
  assert.match(a2eLine!, /getImageApiKeyForProvider\("a2e"\)/);
});

test("the openai fallback resolves its own key via getImageApiKeyForProvider, not getImageApiKey()", () => {
  const block = fallbackBlock();
  const openaiLine = block.split("\n").find((l) => l.includes('provider: "openai"'));
  assert.ok(openaiLine, "expected an openai entry in the fallback chain");
  assert.match(openaiLine!, /getImageApiKeyForProvider\("openai"\)/);
});

test("the xai fallback (pushed separately, after the main fallbacks array) resolves its own key via getImageApiKeyForProvider", () => {
  const xaiPushStart = source.indexOf('tryOrder.push({ provider: "xai"');
  assert.notEqual(xaiPushStart, -1, "expected the xai fallback push");
  const xaiPushLine = source.slice(xaiPushStart, source.indexOf("\n", xaiPushStart));
  assert.match(xaiPushLine, /getImageApiKeyForProvider\("xai"\)/);
});

test("hedra's fallback entry does NOT need getImageApiKeyForProvider -- it already resolves its own key via getProviderKey(\"hedra\") directly", () => {
  const block = fallbackBlock();
  const hedraLine = block.split("\n").find((l) => l.includes('provider: "hedra"'));
  assert.ok(hedraLine, "expected a hedra entry in the fallback chain");
  // editWithHedra takes no apiKey param at all -- confirm the call site
  // matches its real (referencePath, prompt, model) signature, 3 args.
  assert.match(hedraLine!, /editWithHedra\(referencePath, prompt, "[^"]+"\)/);
});
