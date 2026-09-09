import assert from "node:assert/strict";
import test from "node:test";
import { AGENT_CLAW_NVIDIA_MODEL, DEFAULT_CLAW_NVIDIA_MODEL, FALLBACK_CLAW_NVIDIA_MODELS, PRIMARY_CLAW_NVIDIA_MODEL, NVIDIA_MODELS, NVIDIA_BASE, isNvidiaModelId } from "../../lib/nvidia/models.ts";

test("Claw defaults to Bitdeer Mistral Large 3 with GLM-5 fallback", () => {
  assert.equal(AGENT_CLAW_NVIDIA_MODEL, "mistralai/Mistral-Large-3-675B-Instruct-2512");
  assert.equal(DEFAULT_CLAW_NVIDIA_MODEL, AGENT_CLAW_NVIDIA_MODEL);
  assert.equal(PRIMARY_CLAW_NVIDIA_MODEL, "zai-org/GLM-5");
  assert.deepEqual(FALLBACK_CLAW_NVIDIA_MODELS, [
    "zai-org/GLM-5",
    "mistralai/Mistral-Large-3-675B-Instruct-2512"
  ]);
  assert.equal(NVIDIA_MODELS[DEFAULT_CLAW_NVIDIA_MODEL].toolCalling, true);
  assert.ok(NVIDIA_MODELS[DEFAULT_CLAW_NVIDIA_MODEL].capabilities.includes("tools"));
  assert.equal(NVIDIA_MODELS[PRIMARY_CLAW_NVIDIA_MODEL].toolCalling, true);
  assert.match(NVIDIA_BASE, /api-inference\.bitdeer\.ai/);
});

test("retired NVIDIA.com models are rejected", () => {
  assert.equal(isNvidiaModelId("meta/llama-3.1-8b-instruct"), false);
  assert.equal(isNvidiaModelId("nvidia/nemotron-3-ultra-550b-a55b"), false);
});
