import assert from "node:assert/strict";
import test from "node:test";
import { AGENT_CLAW_NVIDIA_MODEL, DEFAULT_CLAW_NVIDIA_MODEL, FALLBACK_CLAW_NVIDIA_MODELS, PRIMARY_CLAW_NVIDIA_MODEL, NVIDIA_MODELS, isNvidiaModelId } from "../../lib/nvidia/models.ts";

test("Claw defaults to an agentic NVIDIA tool-calling model", () => {
  assert.equal(AGENT_CLAW_NVIDIA_MODEL, "nvidia/nemotron-3-ultra-550b-a55b");
  assert.equal(DEFAULT_CLAW_NVIDIA_MODEL, AGENT_CLAW_NVIDIA_MODEL);
  assert.equal(PRIMARY_CLAW_NVIDIA_MODEL, "nvidia/nemotron-3-super-120b-a12b");
  assert.deepEqual(FALLBACK_CLAW_NVIDIA_MODELS, [
    "moonshotai/kimi-k2.6",
    "nvidia/nemotron-3-super-120b-a12b",
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning"
  ]);
  assert.equal(NVIDIA_MODELS[DEFAULT_CLAW_NVIDIA_MODEL].toolCalling, true);
  assert.ok(NVIDIA_MODELS[DEFAULT_CLAW_NVIDIA_MODEL].capabilities.includes("tools"));
  assert.equal(NVIDIA_MODELS["moonshotai/kimi-k3"].toolCalling, true);
  assert.equal(NVIDIA_MODELS["moonshotai/kimi-k2.6"].preserveAssistantPayload, true);
  assert.equal(NVIDIA_MODELS[PRIMARY_CLAW_NVIDIA_MODEL].toolCalling, true);
});

test("the retired Llama 3.1 8B model is rejected", () => {
  assert.equal(isNvidiaModelId("meta/llama-3.1-8b-instruct"), false);
});
