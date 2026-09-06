/** Tracks provider completion independently of transport EOF. */
export type NativeToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type PendingTool = { id?: string; name?: string; arguments: string };

export class StreamState {
  text = "";
  finishReason = "interrupted";
  reasoningContent = "";
  toolCalls: NativeToolCall[] = [];
  private buffer = "";
  private pending: PendingTool[] = [];
  private onToken: (text: string) => void;
  constructor(onToken: (text: string) => void) { this.onToken = onToken; }
  feed(chunk: string) {
    this.buffer += chunk;
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() || "";
    for (const line of lines) this.line(line);
  }
  end() {
    if (this.buffer) this.line(this.buffer);
    this.buffer = "";
    this.finalizeToolCalls();
  }
  private finalizeToolCalls() {
    this.toolCalls = this.pending
      .filter((slot) => slot.name)
      .map((slot, i) => ({
        id: slot.id || `call_${i}`,
        type: "function" as const,
        function: { name: slot.name as string, arguments: slot.arguments || "{}" }
      }));
  }
  private applyToolDeltas(deltas: unknown) {
    if (!Array.isArray(deltas)) return;
    for (const raw of deltas) {
      if (!raw || typeof raw !== "object") continue;
      const d = raw as { index?: number; id?: string; type?: string; function?: { name?: string; arguments?: string } };
      const idx = typeof d.index === "number" ? d.index : Math.max(0, this.pending.length - (d.id || d.function?.name ? 0 : 1));
      if (!this.pending[idx]) this.pending[idx] = { arguments: "" };
      const slot = this.pending[idx];
      if (typeof d.id === "string" && d.id) slot.id = d.id;
      if (typeof d.function?.name === "string" && d.function.name) slot.name = (slot.name || "") + d.function.name;
      if (typeof d.function?.arguments === "string") slot.arguments += d.function.arguments;
    }
  }
  private line(line: string) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return;
    const data = trimmed.slice(5).trim();
    if (data === "[DONE]") return; // Sentinel alone cannot certify a completed generation.
    let json;
    try { json = JSON.parse(data); } catch { return; }
    const choice = json.choices?.[0];
    const delta = choice?.delta;
    const content = delta?.content;
    if (typeof content === "string" && content) { this.text += content; this.onToken(content); }
    // Thinking traces stay off the operator token stream (models.ts emitsReasoning).
    const reasoning = delta?.reasoning_content ?? delta?.reasoning ?? choice?.message?.reasoning_content;
    if (typeof reasoning === "string" && reasoning) this.reasoningContent += reasoning;
    if (delta?.tool_calls) this.applyToolDeltas(delta.tool_calls);
    if (Array.isArray(choice?.message?.tool_calls)) this.applyToolDeltas(choice.message.tool_calls);
    if (typeof choice?.finish_reason === "string" && choice.finish_reason) this.finishReason = choice.finish_reason;
  }
}
