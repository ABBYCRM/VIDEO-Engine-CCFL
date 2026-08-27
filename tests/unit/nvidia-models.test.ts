import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_CLAW_NVIDIA_MODEL, NVIDIA_MODELS, isNvidiaModelId } from "../../lib/nvidia/models.ts";

test("Claw defaults to a live low-cost NVIDIA model", () => {
  // Re-built 2026-08-27 after the previous default (nemotron-3.5-lightning-30b-a3b)
  // reached EOL. New default is llama-3.2-11b-vision-instruct, also low-cost.
  assert.equal(DEFAULT_CLAW_NVIDIA_MODEL, "meta/llama-3.2-11b-vision-instruct");
  assert.equal(NVIDIA_MODELS[DEFAULT_CLAW_NVIDIA_MODEL].costTier, "low");
});

test("the retired Llama 3.1 8B model is rejected", () => {
  assert.equal(isNvidiaModelId("meta/llama-3.1-8b-instruct"), false);
});
