// lib/nvidia/request.ts — Claw-only.
//
// Thinking / tool-call shaping for NVIDIA NIM chat completions.
// Nemotron Ultra requires chat_template_kwargs when tools + reasoning
// are used together. Kimi-K3 thinking is always on; callers must echo
// reasoning_content + tool_calls on the next turn.

export function applyThinkingMode(body: Record<string, unknown>, thinking?: boolean, model?: string): Record<string, unknown> {
  const id = String(model || body.model || "");
  const hasTools = Array.isArray(body.tools) && body.tools.length > 0;
  const ultra = id.includes("nemotron-3-ultra") || id.includes("nemotron-3-super");
  const kimi = id.startsWith("moonshotai/kimi");
  if (ultra && (thinking || hasTools)) {
    body.chat_template_kwargs = {
      enable_thinking: thinking !== false,
      force_nonempty_content: hasTools
    };
  } else if (kimi) {
    // Kimi-K3 thinking is always enabled on the hosted NIM.
    body.chat_template_kwargs = { ...(typeof body.chat_template_kwargs === "object" && body.chat_template_kwargs ? body.chat_template_kwargs : {}), thinking: thinking !== false };
  }
  return body;
}
