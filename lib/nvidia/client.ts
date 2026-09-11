import { StreamState } from "./stream-state";
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
import type { NativeToolCall } from "./stream-state";
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
      if (Array.isArray(keys) && keys.every((k) => typeof k === "string" && k.trim().length >= 8))
        return keys.map((k) => String(k).trim()) as string[];
    } catch { /* corrupt or old — fall through */ }
  }
  // 2. Legacy single key from settings DB
  const encrypted = getRaw(SETTINGS_KEY);
  if (encrypted) {
    try {
      return [decryptSecret(encrypted)];
    } catch { /* fall through */ }
  }
  const envPool = process.env.BITDEER_API_KEYS || process.env.NVIDIA_API_KEYS;
  if (envPool) {
    try {
      const keys = JSON.parse(envPool) as unknown[];
      if (Array.isArray(keys) && keys.every((k) => typeof k === "string" && k.trim().length >= 8))
        return keys.map((k) => String(k).trim()) as string[];
    } catch { /* invalid JSON — fall through */ }
  }
  const envOne = process.env.BITDEER_API_KEY || process.env.NVIDIA_API_KEY;
  if (envOne) return [envOne];
  throw new NvidiaAuthError("Bitdeer API key(s) are not configured (BITDEER_API_KEY)");
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
  const raw = process.env.CLAW_NVIDIA_MODEL || process.env.BITDEER_TEXT_MODEL || getRaw(CLAW_MODEL_KEY);
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
  return Boolean(process.env.CLAW_NVIDIA_MODEL || process.env.BITDEER_TEXT_MODEL);
}

export function isNvidiaEnabled(): boolean {
  try {
    return getNvidiaModel() !== "disabled" && getNvidiaApiKeys().length > 0;
  } catch {
    return false;
  }
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

export type ChatToolCall = NativeToolCall;

export type OpenAiTool = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ChatContentPart[] | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ChatToolCall[];
  reasoning_content?: string;
};

export type ChatRequest = {
  model: NvidiaModelId;
  messages: ChatMessage[];
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  thinking?: boolean;
  tools?: OpenAiTool[];
  toolChoice?: "auto" | "none" | "required";
  signal?: AbortSignal;
};

export type ChatResponse = {
  text: string;
  finishReason: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null;
  rawModel: string;
  toolCalls: ChatToolCall[];
  reasoningContent: string;
};

function normalizeToolCalls(raw: unknown): ChatToolCall[] {
  if (!Array.isArray(raw)) return [];
  const out: ChatToolCall[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const fn = rec.function && typeof rec.function === "object" ? rec.function as Record<string, unknown> : {};
    const name = typeof fn.name === "string" ? fn.name : "";
    if (!name) continue;
    out.push({
      id: typeof rec.id === "string" && rec.id ? rec.id : `call_${out.length + 1}`,
      type: "function",
      function: { name, arguments: typeof fn.arguments === "string" ? fn.arguments : "{}" }
    });
  }
  return out;
}

function extractAssistant(json: Record<string, unknown> | undefined, fallbackModel: string): ChatResponse {
  const choice = (json?.choices as Array<Record<string, unknown>> | undefined)?.[0];
  const message = (choice?.message ?? {}) as Record<string, unknown>;
  const reasoning = typeof message.reasoning_content === "string" ? message.reasoning_content
    : typeof message.reasoning === "string" ? message.reasoning : "";
  const text = typeof message.content === "string" && message.content.length > 0 ? message.content : reasoning;
  const usage = json?.usage as { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined;
  return {
    text,
    finishReason: typeof choice?.finish_reason === "string" ? choice.finish_reason : "stop",
    usage: usage ? {
      promptTokens: usage.prompt_tokens ?? 0,
      completionTokens: usage.completion_tokens ?? 0,
      totalTokens: usage.total_tokens ?? 0
    } : null,
    rawModel: typeof json?.model === "string" ? json.model : fallbackModel,
    toolCalls: normalizeToolCalls(message.tool_calls),
    reasoningContent: reasoning
  };
}

function buildChatBody(req: ChatRequest, stream: boolean): Record<string, unknown> {
  const messages = req.messages.map((m) => {
    const row: Record<string, unknown> = { role: m.role, content: m.content };
    if (m.name) row.name = m.name;
    if (m.tool_call_id) row.tool_call_id = m.tool_call_id;
    if (m.tool_calls?.length) row.tool_calls = m.tool_calls;
    if (m.reasoning_content) row.reasoning_content = m.reasoning_content;
    return row;
  });
  const body: Record<string, unknown> = {
    model: req.model,
    messages,
    temperature: req.temperature ?? (stream ? 0.3 : 0.7),
    top_p: req.topP ?? 0.9,
    max_tokens: req.maxTokens ?? (stream ? 1600 : 1200),
    stream
  };
  if (req.jsonMode) body.response_format = { type: "json_object" };
  if (req.tools?.length) {
    body.tools = req.tools;
    body.tool_choice = req.toolChoice ?? "auto";
  }
  applyThinkingMode(body, req.thinking, req.model);
  return body;
}

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

  const body = buildChatBody(req, false);

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
          console.warn(`[bitdeer] key ${i + 1}/${keys.length} returned ${status} — key may be invalid: ${redact(result.bodyText ?? "")}`);
          if (i === keys.length - 1) throw new NvidiaAuthError(`NVIDIA rejected the API key (HTTP ${status})`);
          continue;
        }
        if (status === 404) {
          // Model not on this key — no other key will help, fail fast
          throw new NvidiaUpstreamError(`Model ${req.model} not found on this key (HTTP 404)`, 404);
        }
        // Retryable: 429/529/503/timeout/TypeError → try next key
        if (isRetryableNvidiaError(status) || result.timedOut) {
          console.warn(`[bitdeer] key ${i + 1}/${keys.length} returned ${status}${result.timedOut ? " (timeout)" : ""} — trying next key`);
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
      return extractAssistant(result.bodyJson, req.model);
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

  const body = buildChatBody(req, true);

  const timeoutController = new AbortController();
  const t = setTimeout(() => timeoutController.abort(), 60_000);
  const signal = req.signal ? AbortSignal.any([req.signal, timeoutController.signal]) : timeoutController.signal;

  let lastError: Error | null = null;

  try {
  for (const [i, key] of keys.entries()) {
    if (signal.aborted) throw signal.reason ?? new Error("Stream aborted");
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
          console.warn(`[bitdeer] stream key ${i + 1}/${keys.length} HTTP ${r.status}`);
          if (i === keys.length - 1) throw new NvidiaAuthError(`NVIDIA rejected the API key (HTTP ${r.status})`);
          continue;
        }
        if (r.status === 404) throw new NvidiaUpstreamError(`Model ${req.model} not found on this key (HTTP 404)`, 404);
        if (isRetryableNvidiaError(r.status)) {
          console.warn(`[bitdeer] stream key ${i + 1}/${keys.length} HTTP ${r.status} — trying next key`);
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
      const state = new StreamState(onToken);
      let lastActivity = Date.now();

      const watchdog = setInterval(() => {
        if (Date.now() - lastActivity > 25_000) {
          void reader.cancel("watchdog timeout").catch(() => {});
          try { timeoutController.abort(); } catch { /* ignore */ }
        }
      }, 2_000);

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          lastActivity = Date.now();
          state.feed(decoder.decode(value, { stream: true }));
        }
        state.feed(decoder.decode());
        state.end();
        if (signal.aborted) state.finishReason = "interrupted";
      } catch (streamErr) {
        state.finishReason = "interrupted";
        if (req.signal?.aborted) throw req.signal.reason ?? new Error("Stopped");
        console.warn(`[bitdeer] stream watchdog/network error on key ${i + 1}/${keys.length}:`, streamErr instanceof Error ? streamErr.message : streamErr);
        if (!state.text && !signal.aborted) {
          // Try non-stream on this key as fallback
          try {
            clearTimeout(t);
            const fallback = await chatCompletion(req);
            for (const word of fallback.text.split(/(\s+)/)) { if (word) onToken(word); }
            return fallback;
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
        reader.releaseLock();
      }

      clearTimeout(t);
      return {
        text: state.text,
        finishReason: state.finishReason,
        usage: null,
        rawModel: req.model,
        toolCalls: state.toolCalls.filter((c) => c.function.name),
        reasoningContent: state.reasoning
      };
    } catch (e) {
      if (signal.aborted) throw e;
      if (e instanceof NvidiaAuthError || e instanceof NvidiaUpstreamError) {
        if (e instanceof NvidiaAuthError || i === keys.length - 1) throw e;
        lastError = e as Error;
        continue;
      }
      lastError = e as Error;
      // Network/timeout on this key → try next
      if (i < keys.length - 1) {
        console.warn(`[bitdeer] stream key ${i + 1}/${keys.length} network error — trying next key`);
        continue;
      }
    }
  }

  clearTimeout(t);
  throw lastError ?? new NvidiaUpstreamError("NVIDIA stream failed with no keys available", 0);
  } finally { clearTimeout(t); }
}
