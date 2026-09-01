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
export { isNvidiaModelId } from "./models";
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

// Persists the operator's chosen Claw model to the `settings` table. A
// CLAW_NVIDIA_MODEL env var still wins at read time (see getClawModel
// above) — this only changes the DB-persisted fallback used when no env
// override is set.
export function setClawModel(model: NvidiaModelId): void {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`
  ).run(CLAW_MODEL_KEY, model);
}

// Whether an env var is currently overriding the persisted model — the
// UI needs this to explain why a pick doesn't "stick" visibly.
export function isClawModelEnvOverridden(): boolean {
  return Boolean(process.env.CLAW_NVIDIA_MODEL);
}

export function isNvidiaEnabled(): boolean {
  return getNvidiaModel() !== "disabled" && (Boolean(getRaw(SETTINGS_KEY)) || Boolean(process.env.NVIDIA_API_KEY));
}

// Vision-capable models (see lib/nvidia/models.ts's "vision" capability)
// accept an OpenAI-compatible content array instead of a plain string —
// verified against NVIDIA's real hosted API (integrate.api.nvidia.com,
// the exact NVIDIA_BASE this client already uses) via their own
// documented curl/Python examples, 2026-08-30. A plain public HTTPS URL
// works directly in image_url.url; the hosted API also accepts a
// data: URI but caps inline base64 payloads at roughly 180KB, beyond
// which NVIDIA's own docs say to use their separate NVCF asset-upload
// API instead — this client does not implement that path, so callers
// should prefer passing a real public URL (e.g. Instagram's own
// media_url/thumbnail_url) over base64-encoding an image themselves.
export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string | ChatContentPart[] };

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
  const body: any = {
    model: req.model,
    messages: req.messages,
    temperature: req.temperature ?? 0.7,
    top_p: req.topP ?? 0.9,
    max_tokens: req.maxTokens ?? 1200,
    stream: false
  };
  if (req.jsonMode) body.response_format = { type: "json_object" };
  applyThinkingMode(body, req.thinking);
  // A 30s hard timeout always applies, even when the caller (runtime.ts,
  // on every real chat turn) also passes its own client-disconnect signal —
  // combining them with AbortSignal.any() instead of only timing out when
  // no external signal is given. Without this, a caller-supplied signal
  // silently disabled the timeout entirely, so a hung NVIDIA connect/response
  // could block until DigitalOcean's own gateway timeout produced a 504.
  const timeoutController = new AbortController();
  const t = setTimeout(() => timeoutController.abort(new Error("NVIDIA request timed out after 30s")), 30_000);
  const signal = req.signal ? AbortSignal.any([req.signal, timeoutController.signal]) : timeoutController.signal;
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
      body: JSON.stringify(body as any),
      cache: "no-store",
      signal
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
    clearTimeout(t);
  }
}

export async function chatCompletionStream(req: ChatRequest, onToken: (chunk: string) => void): Promise<ChatResponse> {
  if (req.model === "disabled") throw new NvidiaDisabledError();
  const key = getNvidiaApiKey();
  const body: any = {
    model: req.model,
    messages: req.messages,
    temperature: req.temperature ?? 0.3,
    top_p: req.topP ?? 0.9,
    max_tokens: req.maxTokens ?? 1600,
    stream: true
  };
  applyThinkingMode(body, req.thinking);
  // Same fix as chatCompletion() above: a hard 60s ceiling on connect +
  // full response, combined with any external signal via AbortSignal.any()
  // instead of only arming a timeout when no external signal is passed.
  // Previously this timeout — and the watchdog's ac.abort() below — were
  // both silently disabled on every real chat turn, since runtime.ts
  // always passes its own client-disconnect signal. A hang before the
  // stream produced its first byte (e.g. NVIDIA slow to accept the
  // connection) had no timeout at all, and would block until
  // DigitalOcean's own gateway timeout returned a 504 to the browser.
  const timeoutController = new AbortController();
  const t = setTimeout(() => timeoutController.abort(new Error("NVIDIA stream timed out after 60s")), 60_000);
  const signal = req.signal ? AbortSignal.any([req.signal, timeoutController.signal]) : timeoutController.signal;
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
      body: JSON.stringify(body as any),
      cache: "no-store",
      signal
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
        try { timeoutController.abort(new Error("watchdog timeout")); } catch { /* ignore */ }
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
    clearTimeout(t);
  }
}
