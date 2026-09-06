import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_CLAW_NVIDIA_MODEL, NVIDIA_MODELS, isNvidiaModelId } from "../../lib/nvidia/models.ts";

test("Claw defaults to a live low-cost NVIDIA model", () => {
  assert.equal(DEFAULT_CLAW_NVIDIA_MODEL, "nvidia/nemotron-3-super-120b-a12b");
  assert.equal(NVIDIA_MODELS[DEFAULT_CLAW_NVIDIA_MODEL].toolCalling, true);
  assert.ok(["low", "mid"].includes(NVIDIA_MODELS[DEFAULT_CLAW_NVIDIA_MODEL].costTier));
});

test("the retired Llama 3.1 8B model is rejected", () => {
  assert.equal(isNvidiaModelId("meta/llama-3.1-8b-instruct"), false);
});
