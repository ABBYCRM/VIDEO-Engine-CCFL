#!/usr/bin/env node
// Optional live probe: NVIDIA chat → tool_calls → tool result → final answer.
// Skips when NVIDIA_API_KEY is unset. Never prints the key.
const NVIDIA_BASE = "https://integrate.api.nvidia.com/v1";

const key = process.env.NVIDIA_API_KEY?.trim();
if (!key) {
  console.log("SKIP: NVIDIA_API_KEY is not set. Unit test tests/unit/claw-native-tools.test.ts is the offline proof.");
  process.exit(0);
}

const model = process.env.CLAW_NVIDIA_MODEL || "nvidia/nemotron-3-super-120b-a12b";
const tools = [{
  type: "function",
  function: {
    name: "web_search",
    description: "Search the web",
    parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] }
  }
}];

const first = await fetch(`${NVIDIA_BASE}/chat/completions`, {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    model,
    temperature: 0.2,
    max_tokens: 400,
    tool_choice: "auto",
    tools,
    messages: [
      { role: "system", content: "You are Claw. Use web_search for live facts. Do not invent results." },
      { role: "user", content: "Search the web for NVIDIA NIM function calling documentation." }
    ]
  })
});
const firstJson = await first.json();
if (!first.ok) {
  console.error("FAIL: first completion HTTP", first.status, String(firstJson?.error?.message || firstJson?.message || "").slice(0, 200));
  process.exit(1);
}
const choice = firstJson.choices?.[0];
const calls = choice?.message?.tool_calls || [];
if (!calls.length && choice?.finish_reason !== "tool_calls") {
  console.error("FAIL: model did not emit tool_calls", choice?.finish_reason);
  process.exit(1);
}

const second = await fetch(`${NVIDIA_BASE}/chat/completions`, {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    model,
    temperature: 0.2,
    max_tokens: 400,
    tool_choice: "auto",
    tools,
    messages: [
      { role: "system", content: "You are Claw. Use web_search for live facts. Do not invent results." },
      { role: "user", content: "Search the web for NVIDIA NIM function calling documentation." },
      choice.message,
      {
        role: "tool",
        tool_call_id: calls[0].id,
        name: calls[0].function?.name,
        content: JSON.stringify({ via: "probe", results: [{ title: "NIM function calling", url: "https://docs.nvidia.com/nim/large-language-models/latest/function-calling.html" }] })
      }
    ]
  })
});
const secondJson = await second.json();
if (!second.ok) {
  console.error("FAIL: second completion HTTP", second.status);
  process.exit(1);
}
const answer = secondJson.choices?.[0]?.message?.content || "";
if (!answer.trim()) {
  console.error("FAIL: empty final answer after tool result");
  process.exit(1);
}
console.log("PASS: chat → tool_calls → tool result → final answer");
console.log("model", model);
console.log("tool", calls[0].function?.name);
console.log("finish", secondJson.choices?.[0]?.finish_reason);
console.log("answer_chars", answer.length);
