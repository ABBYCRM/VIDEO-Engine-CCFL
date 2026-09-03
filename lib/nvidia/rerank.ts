// lib/nvidia/rerank.ts — NVIDIA NIM reranking for Claw's dev-skills RAG.
//
// AUDIT 2026-09-03: NVIDIA reranking endpoint:
//   nvidia/llama-3.2-nv-rerankqa-1b-v2 → 404 Not Found for this account
//   nvidia/nv-rerankqa-mistral-4b-v3    → untested (assume unavailable)
//
// The dev-skills RAG falls back to keyword ordering automatically when
// reranking is unavailable (lib/claw/dev-skills.ts). Reranking is not
// required for MVP operation.
//
// When NVIDIA hosts a reranker on this key's account, re-enable by
// removing the "[key: unavailable]" annotation from RERANK_MODELS notes.
//
// NVIDIA's reranking endpoint (when re-enabled):
//   POST https://integrate.api.nvidia.com/v1/ranking
//   Authorization: Bearer $NVIDIA_API_KEY
//   { "model": "nvidia/llama-3.2-nv-rerankqa-1b-v2",
//     "query":   { "text": "<the operator's question>" },
//     "passages":[ { "text": "<candidate 1>" }, ... ],
//     "truncate":"END" }
// → { "rankings": [ { "index": <pool index>, "logit": <score> }, ... ] }
//   sorted by descending logit. `index` refers back into the passages
//   array we sent, so we map it straight back onto the candidate pool.
//
// Same auth key, same base URL, same optional Helicone routing, and the
// same "never log prompt content" discipline as lib/nvidia/client.ts.

import { NVIDIA_BASE } from "./models";
import { getNvidiaApiKey, NvidiaAuthError, NvidiaUpstreamError } from "./client";
import { heliconeRoute } from "./helicone";
import { db } from "@/lib/db";

// The two reranking NIMs NVIDIA hosts on the build endpoint. The 1B
// QA reranker is the default: it is purpose-built for "given a question,
// rank these passages by how well they answer it", which is precisely
// the dev-skills lookup, and it is the cheapest/fastest of the two.
export type RerankModelId =
  | "nvidia/llama-3.2-nv-rerankqa-1b-v2"
  | "nvidia/nv-rerankqa-mistral-4b-v3";

export const RERANK_MODELS: Record<RerankModelId, { id: RerankModelId; label: string; notes: string }> = {
  "nvidia/llama-3.2-nv-rerankqa-1b-v2": {
    id: "nvidia/llama-3.2-nv-rerankqa-1b-v2",
    label: "Llama 3.2 NV-RerankQA 1B v2 (default) ⚠️",
    notes: "[key: unavailable] Fast, cheap question-answer reranker. Not accessible with the current NVIDIA_API_KEY (HTTP 404). RAG falls back to keyword order."
  },
  "nvidia/nv-rerankqa-mistral-4b-v3": {
    id: "nvidia/nv-rerankqa-mistral-4b-v3",
    label: "NV-RerankQA Mistral 4B v3 ⚠️",
    notes: "[key: unavailable] Larger, stronger reranker. Higher latency; not accessible with the current NVIDIA_API_KEY. RAG falls back to keyword order."
  }
};

export const DEFAULT_CLAW_RERANK_MODEL: RerankModelId = "nvidia/llama-3.2-nv-rerankqa-1b-v2";

const RERANK_MODEL_KEY = "claw_rerank_model";

function getRaw(key: string): string | null {
  return (db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined)?.value ?? null;
}

export function isRerankModelId(v: unknown): v is RerankModelId {
  return typeof v === "string" && v in RERANK_MODELS;
}

/** The reranker model Claw uses. Env var wins, then the persisted
 *  setting, then the fast 1B default. Mirrors getClawModel() in client.ts. */
export function getClawRerankModel(): RerankModelId {
  const raw = process.env.CLAW_RERANK_MODEL || getRaw(RERANK_MODEL_KEY);
  if (isRerankModelId(raw)) return raw;
  return DEFAULT_CLAW_RERANK_MODEL;
}

/** Reranking reuses the single NVIDIA API key. If NVIDIA isn't
 *  configured we can't rerank — callers fall back to keyword order. */
export function isRerankConfigured(): boolean {
  try {
    getNvidiaApiKey();
    return true;
  } catch {
    return false;
  }
}

export type RerankResult = { index: number; score: number };

function redact(s: string, max = 280): string {
  return s.length <= max ? s : s.slice(0, max) + `… (+${s.length - max} chars)`;
}

/**
 * Rerank `passages` against `query` with an NVIDIA reranking NIM.
 * Returns `{ index, score }` sorted best-first, where `index` points
 * back into the `passages` array. Throws NvidiaAuthError when the key
 * is missing and NvidiaUpstreamError on a non-2xx response, so the
 * caller can decide whether to fall back to keyword order.
 */
export async function rerankPassages(input: {
  query: string;
  passages: string[];
  model?: RerankModelId;
  topN?: number;
  signal?: AbortSignal;
}): Promise<RerankResult[]> {
  const passages = input.passages ?? [];
  if (passages.length === 0) return [];
  if (passages.length === 1) return [{ index: 0, score: 1 }];

  let key: string;
  try {
    key = getNvidiaApiKey();
  } catch (e) {
    if (e instanceof NvidiaAuthError) throw e;
    throw new NvidiaAuthError(e instanceof Error ? e.message : String(e));
  }

  const model = input.model ?? getClawRerankModel();
  const body = {
    model,
    query: { text: input.query },
    // The 1B reranker has a modest context window; cap each passage so a
    // long skill body can't blow the request. `truncate:"END"` also lets
    // the server clip server-side as a backstop.
    passages: passages.map((text) => ({ text: text.slice(0, 3000) })),
    truncate: "END" as const
  };

  // 15s hard ceiling, combined with any caller signal — same discipline
  // as the chat client. Reranking is a fast call; if it hangs we'd rather
  // fall back to keyword order than hold the chat turn open.
  const timeoutController = new AbortController();
  const t = setTimeout(() => timeoutController.abort(new Error("NVIDIA rerank timed out after 15s")), 15_000);
  const signal = input.signal ? AbortSignal.any([input.signal, timeoutController.signal]) : timeoutController.signal;

  try {
    const { url, extraHeaders } = heliconeRoute(`${NVIDIA_BASE}/ranking`);
    const r = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...extraHeaders
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal
    });
    if (!r.ok) {
      const text = await r.text();
      // never log passage content — it may include the operator's own material
      console.warn(`[nvidia] rerank HTTP ${r.status} for model ${model} (body ${redact(text)})`);
      if (r.status === 401 || r.status === 403) throw new NvidiaAuthError(`NVIDIA rejected the API key (HTTP ${r.status})`);
      throw new NvidiaUpstreamError(`NVIDIA rerank HTTP ${r.status}: ${redact(text)}`, r.status);
    }
    const json = (await r.json()) as { rankings?: Array<{ index?: number; logit?: number }> };
    const rankings = Array.isArray(json.rankings) ? json.rankings : [];
    const cleaned = rankings
      .filter((x) => typeof x.index === "number" && x.index >= 0 && x.index < passages.length)
      .map((x) => ({ index: x.index as number, score: typeof x.logit === "number" ? x.logit : 0 }));
    // NVIDIA returns these sorted by descending logit already, but sort
    // defensively so we never depend on response ordering.
    cleaned.sort((a, b) => b.score - a.score);
    return typeof input.topN === "number" ? cleaned.slice(0, Math.max(1, input.topN)) : cleaned;
  } finally {
    clearTimeout(t);
  }
}
