import assert from "node:assert/strict";
import test from "node:test";
import { applyThinkingMode } from "../../lib/nvidia/request.ts";

test("NVIDIA requests disable thinking for low-latency Claw turns", () => {
  const body = applyThinkingMode({ stream: true }, false);
  assert.deepEqual(body.chat_template_kwargs, { enable_thinking: false });
});
