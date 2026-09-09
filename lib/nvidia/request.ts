// Thinking / tool-call shaping for Bitdeer chat completions.
// GLM-5 is a reasoning model. Mistral Large 3 does not need extra kwargs.

export function applyThinkingMode(body: Record<string, unknown>, thinking?: boolean, model?: string): Record<string, unknown> {
  const id = String(model || body.model || "");
  if (id.startsWith("zai-org/GLM") && thinking) {
    body.chat_template_kwargs = {
      ...(typeof body.chat_template_kwargs === "object" && body.chat_template_kwargs ? body.chat_template_kwargs : {}),
      enable_thinking: true
    };
  }
  return body;
}
