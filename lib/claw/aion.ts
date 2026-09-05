// Server-side Aion-Brain bridge. Credentials and destination never come from tool arguments.
export type AionContext = { conversationId?: string; signal?: AbortSignal };

export async function aionN8n(action: unknown, args: unknown, context: AionContext = {}) {
  if (!["n8n_status", "n8n_tools", "n8n_workflows", "n8n_call", "n8n_aura"].includes(String(action))) throw new Error("Unknown n8n action.");
  const response = await request(`/api/tools/${action}`, context, args ?? {});
  return response.json();
}

function config() {
  const base = process.env.AION_BASE_URL?.trim();
  const key = process.env.AION_API_KEY?.trim();
  if (!base || !key) throw new Error("Aion-Brain is not configured. Run bash scripts/setup-aion-local.sh or set AION_BASE_URL and AION_API_KEY on the server.");
  const url = new URL(base);
  const local = ["localhost", "127.0.0.1", "[::1]", "aion-brain"].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
      (url.protocol !== "https:" && !(url.protocol === "http:" && local))) {
    throw new Error("AION_BASE_URL must be an HTTPS origin (HTTP is allowed for the local Aion service).");
  }
  return { origin: url.origin, key };
}

async function request(path: string, context: AionContext, body?: unknown) {
  const { origin, key } = config();
  const timeout = AbortSignal.timeout(body ? 120_000 : 10_000);
  const signal = context.signal ? AbortSignal.any([context.signal, timeout]) : timeout;
  const response = await fetch(origin + path, {
    method: body ? "POST" : "GET",
    headers: { "X-AION-Key": key, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "error", cache: "no-store", signal
  });
  if (!response.ok) {
    await response.body?.cancel();
    // Do not expose an upstream body that might contain credentials or private state.
    throw new Error(`Aion-Brain returned HTTP ${response.status}${response.status === 401 || response.status === 403 ? " (check the server's AION_API_KEY)" : ""}.`);
  }
  return response;
}

export async function aionStatus(context: AionContext = {}) {
  const response = await request("/api/state", context);
  const state = await response.json();
  if (state.ok !== true || state.app !== "aion-brain") throw new Error("The configured server did not identify itself as Aion-Brain.");
  // Whitelist service health, not global active state or another session's context.
  return { ok: true, connected: true, app: state.app, version: state.version,
    primaryModel: state.primary_model, providers: state.providers,
    echoOnly: Array.isArray(state.providers) && state.providers.every((p: string) => p === "echo") };
}

export async function aionCurriculum(topics: unknown, format: unknown = "markdown", context: AionContext = {}) {
  if (!context.conversationId) throw new Error("Aion curriculum requires a Claw conversation.");
  if (topics !== undefined && (!Array.isArray(topics) || topics.length < 1 || topics.length > 42 || topics.some(t => typeof t !== "string" || t.length > 100))) {
    throw new Error("topics must be an array of 1–42 topic names, or omitted for all topics.");
  }
  if (format !== "markdown" && format !== "json") throw new Error("format must be markdown or json.");
  const response = await request("/api/sqm", context, { topics, format });
  if (!response.body) throw new Error("Aion-Brain returned no curriculum.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 16_000_000) throw new Error("Curriculum exceeded 16 MB. Request fewer topics.");
      chunks.push(part.value);
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const bytes = Buffer.concat(chunks);
  if (!bytes.length) throw new Error("Aion-Brain returned an empty curriculum.");
  if (format === "json") {
    const document = JSON.parse(bytes.toString("utf8"));
    if (!Array.isArray(document.sections)) throw new Error("Aion-Brain returned an invalid curriculum.");
  } else if (!bytes.toString("utf8").startsWith("# Comprehensive Software & Technology SQM")) {
    throw new Error("Aion-Brain returned an invalid curriculum.");
  }
  return { bytes, name: format === "json" ? "aion-curriculum.json" : "aion-curriculum.md",
    mime: format === "json" ? "application/json" : "text/markdown" };
}

export async function aionConsult(prompt: string, context: AionContext = {}) {
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 24_000) throw new Error("Aion prompt must contain 1–24,000 characters.");
  if (!context.conversationId) throw new Error("Aion consultation requires a Claw conversation.");
  const response = await request("/api/chat", context, {
    messages: [{ role: "user", content: prompt.trim() }],
    session_id: `claw:${context.conversationId}`, max_tokens: 2048, skills: false
  });
  if (!response.headers.get("content-type")?.includes("text/event-stream") || !response.body) {
    await response.body?.cancel();
    throw new Error("Aion-Brain did not return a chat event stream.");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "", answer = "", total = 0;
  let done: Record<string, unknown> | undefined;
  let decision: unknown, lattice: unknown;
  const consume = (frame: string) => {
    const data = frame.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
    if (!data || data === "[DONE]") return;
    const event = JSON.parse(data);
    if (event.type === "delta" && typeof event.text === "string") answer += event.text;
    if (event.type === "done") done = event;
    if (event.type === "decision") decision = event.decision;
    if (event.type === "lattice") lattice = { consensus: event.consensus, rationale: event.rationale };
    // An error can be followed by a successful provider fallback. Require a done event below.
  };
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > 1_000_000) throw new Error("Aion-Brain response exceeded the size limit.");
      buffer += decoder.decode(part.value, { stream: true });
      let boundary: RegExpExecArray | null;
      while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
        consume(buffer.slice(0, boundary.index));
        buffer = buffer.slice(boundary.index + boundary[0].length);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) consume(buffer);
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  if (!done || !answer.trim()) throw new Error("Aion-Brain did not complete an answer. Check its provider configuration and logs.");
  return { ok: true, source: "aion-brain", answer, provider: done.provider, model: done.model,
    echoOnly: done.provider === "echo", decision, lattice };
}
