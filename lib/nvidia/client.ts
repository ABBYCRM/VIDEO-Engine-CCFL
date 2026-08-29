// Minimal NVIDIA NIM HTTP client. The build endpoint is OpenAI-compatible:
//   POST https://integrate.api.nvidia.com/v1/chat/completions
//   Authorization: Bearer $NVIDIA_API_KEY
//   { model, messages, temperature, top_p, max_tokens, response_format?: { type: "json_object" } }
//
// We do NOT log the messages array on failure — operator's brief, section 19:
// "Never log entire provider request objects if they may include protected
//  material" (e.g. client campaign content). We log only the model id, the
// HTTP status, the truncated error message, and a redacted length.

import { DEFAULT_CLAW_NVIDIA_MODEL, NVIDIA_BASE, isNvidiaModelId, type NvidiaModelId } from "./models";
import { applyThinkingMode } from "./request";
import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { heliconeRoute } from "./helicone";

export class NvidiaAuthError extends Error {
  constructor(message: string) { super(message); this.name = "NvidiaAuthError"; }
}
export class NvidiaUpstreamError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.name = "NvidiaUpstreamError"; this.status = status; }
}
export class NvidiaDisabledError extends Error {
  constructor() { super("NVIDIA is disabled in settings"); this.name = "NvidiaDisabledError"; }
}

const SETTINGS_KEY = "nvidia_api_key";
const SETTINGS_MODEL_KEY = "nvidia_model";

function getRaw(key: string): string | null {
  return (db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined)?.value ?? null;
}

export function getNvidiaApiKey(): string {
  const encrypted = getRaw(SETTINGS_KEY);
  if (encrypted) return decryptSecret(encrypted);
  if (process.env.NVIDIA_API_KEY) return process.env.NVIDIA_API_KEY;
  throw new NvidiaAuthError("NVIDIA API key is not configured");
}

export function getNvidiaModel(): NvidiaModelId {
  const raw = getRaw(SETTINGS_MODEL_KEY);
  if (isNvidiaModelId(raw)) return raw;
  // Fall through to the live default — Llama 3.2 11B (replaces the EOL 3.1 70B)
  return "meta/llama-3.2-11b-vision-instruct";
}

const CLAW_MODEL_KEY = "claw_nvidia_model";

export function getClawModel(): NvidiaModelId {
  const raw = process.env.CLAW_NVIDIA_MODEL || getRaw(CLAW_MODEL_KEY);
  if (isNvidiaModelId(raw) && raw !== "disabled") return raw;
  // A retired or invalid persisted model automatically moves to the supported fast default.
  return DEFAULT_CLAW_NVIDIA_MODEL;
}

export function isNvidiaEnabled(): boolean {
  return getNvidiaModel() !== "disabled" && (Boolean(getRaw(SETTINGS_KEY)) || Boolean(process.env.NVIDIA_API_KEY));
}

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type ChatRequest = {
  model: NvidiaModelId;
  messages: ChatMessage[];
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  thinking?: boolean;
  signal?: AbortSignal;
};

export type ChatResponse = {
  text: string;
  finishReason: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null;
  rawModel: string;
};

function redact(s: string, max = 280): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + `… (+${s.length - max} chars)`;
}

export async function chatCompletion(req: ChatRequest): Promise<ChatResponse> {
  if (req.model === "disabled") throw new NvidiaDisabledError();
  let key: string;
  try {
    key = getNvidiaApiKey();
  } catch (e) {
    if (e instanceof NvidiaAuthError) throw e;
    throw new NvidiaAuthError(e instanceof Error ? e.message : String(e));
  }
  const body: Record<string, unknown> = {
    model: req.model,
    messages: req.messages,
    temperature: req.temperature ?? 0.7,
    top_p: req.topP ?? 0.9,
    max_tokens: req.maxTokens ?? 1200,
    stream: false
  };
  if (req.jsonMode) body.response_format = { type: "json_object" };
  applyThinkingMode(body, req.thinking);
  const ac = req.signal ? null : new AbortController();
  const t = ac ? setTimeout(() => ac.abort(), 30_000) : null;
  try {
    const { url, extraHeaders } = heliconeRoute(`${NVIDIA_BASE}/chat/completions`);
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
        ...extraHeaders
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: req.signal ?? ac!.signal
    });
    if (!r.ok) {
      const text = await r.text();
      // never log full prompt content
      console.warn(`[nvidia] upstream HTTP ${r.status} for model ${req.model} (body ${redact(text)})`);
      if (r.status === 401 || r.status === 403) {
        throw new NvidiaAuthError(`NVIDIA rejected the API key (HTTP ${r.status})`);
      }
      throw new NvidiaUpstreamError(`NVIDIA upstream HTTP ${r.status}: ${redact(text)}`, r.status);
    }
    const json = await r.json() as {
      model?: string;
      choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };
    const text = json.choices?.[0]?.message?.content ?? "";
    return {
      text,
      finishReason: json.choices?.[0]?.finish_reason ?? "stop",
      usage: json.usage ? {
        promptTokens: json.usage.prompt_tokens ?? 0,
        completionTokens: json.usage.completion_tokens ?? 0,
        totalTokens: json.usage.total_tokens ?? 0
      } : null,
      rawModel: json.model ?? req.model
    };
  } finally {
    if (t) clearTimeout(t);
  }
}

export async function chatCompletionStream(req: ChatRequest, onToken: (chunk: string) => void): Promise<ChatResponse> {
  if (req.model === "disabled") throw new NvidiaDisabledError();
  const key = getNvidiaApiKey();
  const body: Record<string, unknown> = {
    model: req.model,
    messages: req.messages,
    temperature: req.temperature ?? 0.3,
    top_p: req.topP ?? 0.9,
    max_tokens: req.maxTokens ?? 1600,
    stream: true
  };
  applyThinkingMode(body, req.thinking);
  const ac = req.signal ? null : new AbortController();
  const t = ac ? setTimeout(() => ac.abort(), 60_000) : null;
  try {
    const { url, extraHeaders } = heliconeRoute(`${NVIDIA_BASE}/chat/completions`);
    const r = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        ...extraHeaders
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: req.signal ?? ac!.signal
    });
    if (!r.ok) {
      const text = await r.text();
      console.warn(`[nvidia] stream HTTP ${r.status} for model ${req.model} (body ${redact(text)})`);
      if (r.status === 401 || r.status === 403) throw new NvidiaAuthError(`NVIDIA rejected the API key (HTTP ${r.status})`);
      throw new NvidiaUpstreamError(`NVIDIA upstream HTTP ${r.status}: ${redact(text)}`, r.status);
    }
    if (!r.body) throw new NvidiaUpstreamError("NVIDIA stream returned no body", 502);
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let text = "";
    let finishReason = "stop";
    // Watchdog: some retired models on NVIDIA's build endpoint accept the
    // request, return 200, but never write a single token. If 25s passes
    // without activity, cancel the stream and fall back to a non-stream call.
    let lastActivity = Date.now();
    const watchdog = setInterval(() => {
      if (Date.now() - lastActivity > 25_000) {
        try { reader.cancel("watchdog timeout").catch(() => {}); } catch { /* ignore */ }
        try { ac?.abort("watchdog timeout"); } catch { /* ignore */ }
      }
    }, 2_000);
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        lastActivity = Date.now();
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n");
        buf = parts.pop() || "";
        for (const line of parts) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const data = trimmed.slice(5).trim();
          if (data === "[DONE]") continue;
          try {
            const json = JSON.parse(data) as {
              choices?: Array<{
                delta?: { content?: string; reasoning_content?: string };
                finish_reason?: string | null;
              }>;
            };
            // deepseek-v4-* models emit a `reasoning_content` thinking trace.
            // The registry records `emitsReasoning` and we strip it here so the
            // operator only ever sees the actual answer text.
            const delta = json.choices?.[0]?.delta?.content || "";
            if (delta) {
              text += delta;
              onToken(delta);
            }
            if (json.choices?.[0]?.finish_reason) finishReason = String(json.choices[0].finish_reason);
          } catch { /* ignore malformed SSE lines */ }
        }
      }
    } catch (streamErr) {
      // Watchdog tripped or the connection died. If we already have some text,
      // surface what we have. Otherwise fall back to a non-stream call so the
      // operator always gets an answer.
      console.warn(`[nvidia] stream interrupted for ${req.model}:`, streamErr instanceof Error ? streamErr.message : streamErr);
      if (!text) {
        try {
          const fallback = await chatCompletion(req);
          for (const word of fallback.text.split(/(\s+)/)) {
            if (word) onToken(word);
          }
          text = fallback.text;
          finishReason = fallback.finishReason;
        } catch (fallbackErr) {
          // Re-throw with the original stream error so the operator sees a useful message
          throw new NvidiaUpstreamError(
            `NVIDIA stream + fallback both failed: ${fallbackErr instanceof Error ? fallbackErr.message : fallbackErr}`,
            502
          );
        }
      }
    } finally {
      clearInterval(watchdog);
    }
    return { text, finishReason, usage: null, rawModel: req.model };
  } finally {
    if (t) clearTimeout(t);
  }
}
