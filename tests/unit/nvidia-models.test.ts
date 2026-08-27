import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_CLAW_NVIDIA_MODEL, NVIDIA_MODELS, isNvidiaModelId } from "../../lib/nvidia/models.ts";

test("Claw defaults to the supported low-latency Nemotron model", () => {
  assert.equal(DEFAULT_CLAW_NVIDIA_MODEL, "nvidia/nemotron-3.5-lightning-30b-a3b");
  assert.equal(NVIDIA_MODELS[DEFAULT_CLAW_NVIDIA_MODEL].costTier, "low");
});

test("the retired Llama 3.1 8B model is rejected", () => {
  assert.equal(isNvidiaModelId("meta/llama-3.1-8b-instruct"), false);
});
