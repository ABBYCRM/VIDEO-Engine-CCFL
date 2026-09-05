import assert from "node:assert/strict";
import test from "node:test";
import { parseToolCalls } from "../../lib/claw/execution.ts";

test("parses complete strict tool calls", () => {
  assert.deepEqual(parseToolCalls('<tool_call name="app_status">{}</tool_call>'), [{ name: "app_status", args: {} }]);
});
test("missing closing slash requests correction instead of dispatch", () => {
  assert.throws(() => parseToolCalls('<tool_call name="ig_list_media">{"limit":12}<tool_call>'));
});
test("rejects pasted argument shapes in tool names", () => {
  assert.throws(() => parseToolCalls('<tool_call name="app_status {}">{}<tool_call>'));
});
test("rejects a garbled batch before any call can run", () => {
  assert.throws(() => parseToolCalls('<tool_call name="app_status">{}</tool_call><tool_call name="bad {}">{}<tool_call>'));
});
