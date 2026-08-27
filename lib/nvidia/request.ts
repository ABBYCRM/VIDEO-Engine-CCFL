export function applyThinkingMode(body: Record<string, unknown>, thinking: boolean | undefined) {
  if (typeof thinking === "boolean") {
    body.chat_template_kwargs = { enable_thinking: thinking };
  }
  return body;
}
