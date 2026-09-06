// Shape NVIDIA NIM request bodies for thinking / tool-calling models.
// Unknown extra fields can 400 a model, so kwargs are family-scoped.

export function applyThinkingMode(body: Record<string, unknown>, thinking?: boolean, model?: string): Record<string, unknown> {
  if (thinking === undefined) return body;
  const id = String(model || body.model || "");
  if (!id) return body;
  const enable = thinking === true;
  if (
    id.startsWith("nvidia/nemotron") ||
    id.startsWith("nvidia/llama-3") ||
    id.includes("nemotron") ||
    id.startsWith("moonshotai/kimi") ||
    id.startsWith("deepseek-ai/") ||
    id.startsWith("qwen/")
  ) {
    body.chat_template_kwargs = {
      enable_thinking: enable,
      thinking: enable
    };
  }
  return body;
}
