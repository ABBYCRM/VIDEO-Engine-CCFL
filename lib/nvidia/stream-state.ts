/** Tracks provider completion independently of transport EOF. */
export class StreamState {
  text = "";
  finishReason = "interrupted";
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
    const delta = choice?.delta?.content;
    if (typeof delta === "string" && delta) { this.text += delta; this.onToken(delta); }
    if (typeof choice?.finish_reason === "string" && choice.finish_reason) this.finishReason = choice.finish_reason;
  }
}
