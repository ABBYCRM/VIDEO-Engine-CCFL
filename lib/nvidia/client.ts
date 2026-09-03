// NVIDIA NIM HTTP client with multi-key failover.
//
// The build endpoint is OpenAI-compatible:
//   POST https://integrate.api.nvidia.com/v1/chat/completions
//
// MULTI-KEY ARCHITECTURE (2026-09-03):
//   All 11 operator-provided NVIDIA API keys are stored as an encrypted JSON
//   array in the settings DB under "nvidia_api_keys".  The client cycles
//   through keys on retryable errors (HTTP 529 server overload, HTTP 429
//   rate limit, network timeout, TypeError).  Non-retryable errors
//   (HTTP 401/403 bad key, HTTP 404 model not on key) fail immediately.
//   Single-key fallback: if no multi-key pool exists, the legacy
//   nvidia_api_key + NVIDIA_API_KEY env var still work.
//
// We do NOT log the messages array on failure — operator's brief, section 19:
// "Never log entire provider request objects if they may include protected
//  material" (e.g. client campaign content).  We log only the model id, the
// HTTP status, the truncated error message, and a redacted length.

import { DEFAULT_CLAW_NVIDIA_MODEL, NVIDIA_BASE, isNvidiaModelId, type NvidiaModelId } from "./models";
export { isNvidiaModelId } from "./models";
import { applyThinkingMode } from "./request";
import { db } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
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

// ── Key pool storage ────────────────────────────────────────────────────────────

const SETTINGS_KEY = "nvidia_api_key";          // legacy single-key setting
const SETTINGS_KEYS = "nvidia_api_keys";        // multi-key pool
const SETTINGS_MODEL_KEY = "nvidia_model";

function getRaw(key: string): string | null {
  return (db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined)?.value ?? null;
}

export function getNvidiaApiKeys(): string[] {
  // 1. Encrypted multi-key pool in settings DB
  const encryptedPool = getRaw(SETTINGS_KEYS);
  if (encryptedPool) {
    try {
      const decrypted = decryptSecret(encryptedPool);
      const keys = JSON.parse(decrypted) as unknown[];
      if (Array.isArray(keys) && keys.every((k) => typeof k === "string" && k.startsWith("nvapi-")))
        return keys as string[];
    } catch { /* corrupt or old — fall through */ }
  }
  // 2. Legacy single key from settings DB
  const encrypted = getRaw(SETTINGS_KEY);
  if (encrypted) {
    try {
      return [decryptSecret(encrypted)];
    } catch { /* fall through */ }
  }
  // 3. NVIDIA_API_KEYS env var (JSON array)
  if (process.env.NVIDIA_API_KEYS) {
    try {
      const keys = JSON.parse(process.env.NVIDIA_API_KEYS) as unknown[];
      if (Array.isArray(keys) && keys.every((k) => typeof k === "string" && k.startsWith("nvapi-")))
        return keys as string[];
    } catch { /* invalid JSON — fall through */ }
  }
  // 4. NVIDIA_API_KEY env var (single key, legacy)
  if (process.env.NVIDIA_API_KEY) return [process.env.NVIDIA_API_KEY];
  throw new NvidiaAuthError("NVIDIA API key(s) are not configured");
}

// Persist the full key pool (all 11) as an encrypted JSON array.
export function setNvidiaApiKeys(keys: string[]): void {
  if (!keys.length) throw new Error("At least one NVIDIA API key is required");
  const encrypted = encryptSecret(JSON.stringify(keys));
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`
  ).run(SETTINGS_KEYS, encrypted);
}

// Legacy single-key getter (used by isNvidiaEnabled check)
export function getNvidiaApiKey(): string {
  const keys = getNvidiaApiKeys();
  return keys[0];
}

export function getNvidiaModel(): NvidiaModelId {
  const raw = getRaw(SETTINGS_MODEL_KEY);
  if (isNvidiaModelId(raw)) return raw;
  return DEFAULT_CLAW_NVIDIA_MODEL;
}

const CLAW_MODEL_KEY = "claw_nvidia_model";

export function getClawModel(): NvidiaModelId {
  const raw = process.env.CLAW_NVIDIA_MODEL || getRaw(CLAW_MODEL_KEY);
  if (isNvidiaModelId(raw) && raw !== "disabled") return raw;
  return DEFAULT_CLAW_NVIDIA_MODEL;
}

export function setClawModel(model: NvidiaModelId): void {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`
  ).run(CLAW_MODEL_KEY, model);
}

export function isClawModelEnvOverridden(): boolean {
  return Boolean(process.env.CLAW_NVIDIA_MODEL);
}

export function isNvidiaEnabled(): boolean {
  return getNvidiaModel() !== "disabled" && getNvidiaApiKeys().length > 0;
}

// ── Retryable error classification ─────────────────────────────────────────────

/**
 * HTTP statuses that should trigger a key switch rather than failing immediately.
 * 529 = NVIDIA build overloaded / at capacity
 * 429 = per-key rate limit hit
 * Anything that looks like a timeout / TypeError on the response body is also
 * retryable since a different key may hit a different backend instance.
 */
function isRetryableNvidiaError(status: number): boolean {
  return status === 429 || status === 529 || status === 503 || status === 504;
}

// ── Types ──────────────────────────────────────────────────────────────────────

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

// ── Core request helper ────────────────────────────────────────────────────────

function redact(s: string, max = 280): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + `… (+${s.length - max} chars)`;
}

interface FetchResult {
  ok: boolean;
  status: number;
  bodyJson?: Record<string, unknown>;
  bodyText?: string;
  timedOut?: boolean;
}

async function nvidiaFetch(
  url: string,
  body: unknown,
  key: string,
  signal: AbortSignal,
  timeoutMs: number
): Promise<FetchResult> {
  const timeoutController = new AbortController();
  const t = setTimeout(() => timeoutController.abort(), timeoutMs);
  const combinedSignal = AbortSignal.any([signal, timeoutController.signal]);
  try {
    const { url: finalUrl, extraHeaders } = heliconeRoute(url);
    const r = await fetch(finalUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...extraHeaders,
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: combinedSignal,
    });
    if (!r.ok) {
      const text = await r.text();
      return { ok: false, status: r.status, bodyText: text };
    }
    const json = await r.json() as Record<string, unknown>;
    return { ok: true, status: r.status, bodyJson: json };
  } catch (e) {
    const err = e as Error & { code?: string; name?: string };
    // Timeout or network failure → retry on next key
    if (err.name === "AbortError" || err.code === "ETIMEDOUT" || err.code === "ECONNRESET" || err.message?.includes("timed out")) {
      return { ok: false, status: 0, bodyText: err.message, timedOut: true };
    }
    // TypeError on a non-JSON response body (NVIDIA's occasional broken JSON) → retry
    if (err.name === "TypeError" || err.message?.includes("Unexpected token")) {
      return { ok: false, status: 0, bodyText: err.message, timedOut: true };
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
}

// ── chatCompletion with key cycling ─────────────────────────────────────────────

export async function chatCompletion(req: ChatRequest): Promise<ChatResponse> {
  if (req.model === "disabled") throw new NvidiaDisabledError();
  const keys = getNvidiaApiKeys();

  const body: Record<string, unknown> = {
    model: req.model,
    messages: req.messages,
    temperature: req.temperature ?? 0.7,
    top_p: req.topP ?? 0.9,
    max_tokens: req.maxTokens ?? 1200,
    stream: false,
  };
  if (req.jsonMode) body.response_format = { type: "json_object" };
  applyThinkingMode(body, req.thinking);

  const timeoutController = new AbortController();
  const t = setTimeout(() => timeoutController.abort(), 30_000);
  const signal = req.signal ? AbortSignal.any([req.signal, timeoutController.signal]) : timeoutController.signal;

  let lastError: Error | null = null;
  for (const [i, key] of keys.entries()) {
    try {
      const { url } = heliconeRoute(`${NVIDIA_BASE}/chat/completions`);
      const result = await nvidiaFetch(url, body, key, signal, 30_000);

      if (!result.ok) {
        const status = result.status;
        // Non-retryable: bad key or model not on this key
        if (status === 401 || status === 403) {
          console.warn(`[nvidia] key ${i + 1}/${keys.length} returned ${status} — key may be invalid: ${redact(result.bodyText ?? "")}`);
          if (i === keys.length - 1) throw new NvidiaAuthError(`NVIDIA rejected the API key (HTTP ${status})`);
          continue;
        }
        if (status === 404) {
          // Model not on this key — no other key will help, fail fast
          throw new NvidiaUpstreamError(`Model ${req.model} not found on this key (HTTP 404)`, 404);
        }
        // Retryable: 429/529/503/timeout/TypeError → try next key
        if (isRetryableNvidiaError(status) || result.timedOut) {
          console.warn(`[nvidia] key ${i + 1}/${keys.length} returned ${status}${result.timedOut ? " (timeout)" : ""} — trying next key`);
          if (i === keys.length - 1) throw new NvidiaUpstreamError(
            `All ${keys.length} NVIDIA keys exhausted (last: HTTP ${status}). Try again shortly.`,
            status
          );
          continue;
        }
        // Other HTTP errors
        throw new NvidiaUpstreamError(`NVIDIA upstream HTTP ${status}: ${redact(result.bodyText ?? "")}`, status);
      }

      // Success
      clearTimeout(t);
      const json = result.bodyJson as {
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
          totalTokens: json.usage.total_tokens ?? 0,
        } : null,
        rawModel: json.model ?? req.model,
      };
    } catch (e) {
      if (e instanceof NvidiaAuthError || e instanceof NvidiaUpstreamError) {
        // These are already meaningful — re-throw unless we have more keys
        if (e instanceof NvidiaAuthError || i === keys.length - 1) throw e;
        lastError = e as Error;
        continue;
      }
      lastError = e as Error;
    }
  }
  clearTimeout(t);
  throw lastError ?? new NvidiaUpstreamError("NVIDIA request failed with no keys available", 0);
}

// ── chatCompletionStream with key cycling ───────────────────────────────────────

export async function chatCompletionStream(
  req: ChatRequest,
  onToken: (chunk: string) => void
): Promise<ChatResponse> {
  if (req.model === "disabled") throw new NvidiaDisabledError();
  const keys = getNvidiaApiKeys();

  const body: Record<string, unknown> = {
    model: req.model,
    messages: req.messages,
    temperature: req.temperature ?? 0.3,
    top_p: req.topP ?? 0.9,
    max_tokens: req.maxTokens ?? 1600,
    stream: true,
  };
  applyThinkingMode(body, req.thinking);

  const timeoutController = new AbortController();
  const t = setTimeout(() => timeoutController.abort(), 60_000);
  const signal = req.signal ? AbortSignal.any([req.signal, timeoutController.signal]) : timeoutController.signal;

  let lastError: Error | null = null;

  for (const [i, key] of keys.entries()) {
    try {
      const { url: finalUrl, extraHeaders } = heliconeRoute(`${NVIDIA_BASE}/chat/completions`);
      const r = await fetch(finalUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          ...extraHeaders,
        },
        body: JSON.stringify(body),
        cache: "no-store",
        signal,
      });

      if (!r.ok) {
        const text = await r.text();
        if (r.status === 401 || r.status === 403) {
          console.warn(`[nvidia] stream key ${i + 1}/${keys.length} HTTP ${r.status}`);
          if (i === keys.length - 1) throw new NvidiaAuthError(`NVIDIA rejected the API key (HTTP ${r.status})`);
          continue;
        }
        if (r.status === 404) throw new NvidiaUpstreamError(`Model ${req.model} not found on this key (HTTP 404)`, 404);
        if (isRetryableNvidiaError(r.status)) {
          console.warn(`[nvidia] stream key ${i + 1}/${keys.length} HTTP ${r.status} — trying next key`);
          if (i === keys.length - 1) throw new NvidiaUpstreamError(
            `All ${keys.length} NVIDIA keys exhausted (last: HTTP ${r.status}). Try again shortly.`, r.status
          );
          continue;
        }
        throw new NvidiaUpstreamError(`NVIDIA stream HTTP ${r.status}: ${redact(text)}`, r.status);
      }

      if (!r.body) throw new NvidiaUpstreamError("NVIDIA stream returned no body", 502);

      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let text = "";
      let finishReason = "stop";
      let lastActivity = Date.now();

      const watchdog = setInterval(() => {
        if (Date.now() - lastActivity > 25_000) {
          try { reader.cancel("watchdog timeout"); } catch { /* ignore */ }
          try { timeoutController.abort(); } catch { /* ignore */ }
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
                choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>;
              };
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
        console.warn(`[nvidia] stream watchdog/network error on key ${i + 1}/${keys.length}:`, streamErr instanceof Error ? streamErr.message : streamErr);
        if (!text) {
          // Try non-stream on this key as fallback
          try {
            clearTimeout(t);
            const fallback = await chatCompletion(req);
            for (const word of fallback.text.split(/(\s+)/)) { if (word) onToken(word); }
            return { text: fallback.text, finishReason: fallback.finishReason, usage: null, rawModel: fallback.rawModel };
          } catch (fallbackErr) {
            if (i === keys.length - 1) throw new NvidiaUpstreamError(
              `NVIDIA stream + fallback both failed: ${fallbackErr instanceof Error ? fallbackErr.message : fallbackErr}`, 502
            );
            lastError = fallbackErr as Error;
            continue;
          }
        }
      } finally {
        clearInterval(watchdog);
      }

      clearTimeout(t);
      return { text, finishReason, usage: null, rawModel: req.model };
    } catch (e) {
      if (e instanceof NvidiaAuthError || e instanceof NvidiaUpstreamError) {
        if (e instanceof NvidiaAuthError || i === keys.length - 1) throw e;
        lastError = e as Error;
        continue;
      }
      lastError = e as Error;
      // Network/timeout on this key → try next
      if (i < keys.length - 1) {
        console.warn(`[nvidia] stream key ${i + 1}/${keys.length} network error — trying next key`);
        continue;
      }
    }
  }

  clearTimeout(t);
  throw lastError ?? new NvidiaUpstreamError("NVIDIA stream failed with no keys available", 0);
}
