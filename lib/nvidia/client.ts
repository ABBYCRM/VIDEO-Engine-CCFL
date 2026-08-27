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
import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";

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
  // default: 3.1 70B for content intelligence
  return "meta/llama-3.1-70b-instruct";
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
  const ac = req.signal ? null : new AbortController();
  const t = ac ? setTimeout(() => ac.abort(), 30_000) : null;
  try {
    const r = await fetch(`${NVIDIA_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
        "Accept": "application/json"
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
  const ac = req.signal ? null : new AbortController();
  const t = ac ? setTimeout(() => ac.abort(), 45_000) : null;
  try {
    const r = await fetch(`${NVIDIA_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream"
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
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split("\n");
      buf = parts.pop() || "";
      for (const line of parts) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") continue;
        try {
          const json = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }> };
          const delta = json.choices?.[0]?.delta?.content || "";
          if (delta) {
            text += delta;
            onToken(delta);
          }
          if (json.choices?.[0]?.finish_reason) finishReason = String(json.choices[0].finish_reason);
        } catch { /* ignore malformed SSE lines */ }
      }
    }
    return { text, finishReason, usage: null, rawModel: req.model };
  } finally {
    if (t) clearTimeout(t);
  }
}
