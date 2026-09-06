/** Tracks provider completion independently of transport EOF. */
export type NativeToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export class StreamState {
  text = "";
  reasoning = "";
  finishReason = "interrupted";
  toolCalls: NativeToolCall[] = [];
  private buffer = "";
  private onToken: (text: string) => void;
  constructor(onToken: (text: string) => void) { this.onToken = onToken; }
  feed(chunk: string) {
    this.buffer += chunk;
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() || "";
    for (const line of lines) this.line(line);
  }
  end() { if (this.buffer) this.line(this.buffer); this.buffer = ""; }
  private line(line: string) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return;
    const data = trimmed.slice(5).trim();
    if (data === "[DONE]") return; // Sentinel alone cannot certify a completed generation.
    let json;
    try { json = JSON.parse(data); } catch { return; }
    const choice = json.choices?.[0];
    const delta = choice?.delta ?? {};
    const content = delta.content;
    if (typeof content === "string" && content) { this.text += content; this.onToken(content); }
    const reasoning = delta.reasoning_content ?? delta.reasoning;
    if (typeof reasoning === "string" && reasoning) this.reasoning += reasoning;
    if (Array.isArray(delta.tool_calls)) {
      for (const part of delta.tool_calls) {
        const index = Number.isInteger(part?.index) ? part.index : this.toolCalls.length;
        while (this.toolCalls.length <= index) {
          this.toolCalls.push({ id: "", type: "function", function: { name: "", arguments: "" } });
        }
        const current = this.toolCalls[index];
        if (typeof part.id === "string" && part.id) current.id = part.id;
        if (part.type === "function") current.type = "function";
        if (part.function && typeof part.function === "object") {
          if (typeof part.function.name === "string" && part.function.name) current.function.name += part.function.name;
          if (typeof part.function.arguments === "string" && part.function.arguments) current.function.arguments += part.function.arguments;
        }
      }
    }
    if (typeof choice?.finish_reason === "string" && choice.finish_reason) this.finishReason = choice.finish_reason;
  }
}
