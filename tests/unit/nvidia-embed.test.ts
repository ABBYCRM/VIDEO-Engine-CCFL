import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_CLAW_EMBED_MODEL,
  EMBED_DIM,
  EMBED_MODELS,
  getClawEmbedModel,
  isEmbedModelId
} from "../../lib/nvidia/embed.ts";

test("Nemotron 3 Embed 1B is the active 2048-dimensional default", () => {
  assert.equal(DEFAULT_CLAW_EMBED_MODEL, "nvidia/nemotron-3-embed-1b");
  assert.equal(EMBED_DIM, 2048);
  assert.equal(EMBED_MODELS[DEFAULT_CLAW_EMBED_MODEL].dim, 2048);
  assert.equal(EMBED_MODELS[DEFAULT_CLAW_EMBED_MODEL].active, true);
});

test("CLAW_EMBED_MODEL selects Nemotron and rejects inherited object keys", () => {
  const previous = process.env.CLAW_EMBED_MODEL;
  try {
    process.env.CLAW_EMBED_MODEL = "nvidia/nemotron-3-embed-1b";
    assert.equal(getClawEmbedModel(), "nvidia/nemotron-3-embed-1b");
    assert.equal(isEmbedModelId("toString"), false);
    assert.equal(isEmbedModelId("__proto__"), false);
  } finally {
    if (previous === undefined) delete process.env.CLAW_EMBED_MODEL;
    else process.env.CLAW_EMBED_MODEL = previous;
  }
});
