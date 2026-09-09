// lib/nvidia/rerank.ts — Bitdeer reranking for Claw's dev-skills RAG.
//
// POST https://api-inference.bitdeer.ai/v1/rerank
// {
//   "model": "BAAI/bge-reranker-v2-m3",
//   "query": "<question>",
//   "documents": ["<passage>", ...],
//   "top_n": 2
// }
// → { "results": [ { "index": <pool index>, "relevance_score": <0-1> }, ... ] }

import { NVIDIA_BASE } from "./models";
import { getNvidiaApiKey, NvidiaAuthError, NvidiaUpstreamError } from "./client";
import { heliconeRoute } from "./helicone";
import { db } from "@/lib/db";

export type RerankModelId = "BAAI/bge-reranker-v2-m3";

export const RERANK_MODELS: Record<RerankModelId, { id: RerankModelId; label: string; notes: string }> = {
  "BAAI/bge-reranker-v2-m3": {
    id: "BAAI/bge-reranker-v2-m3",
    label: "BGE Reranker v2-m3 (Bitdeer default)",
    notes: "Cross-encoder reranker on Bitdeer /v1/rerank. Used for Claw dev-skills RAG."
  }
};

export const DEFAULT_CLAW_RERANK_MODEL: RerankModelId = "BAAI/bge-reranker-v2-m3";

const RERANK_MODEL_KEY = "claw_rerank_model";

function getRaw(key: string): string | null {
  return (db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined)?.value ?? null;
}

export function isRerankModelId(v: unknown): v is RerankModelId {
  return typeof v === "string" && v in RERANK_MODELS;
}

export function getClawRerankModel(): RerankModelId {
  const raw = process.env.CLAW_RERANK_MODEL || process.env.BITDEER_RERANK_MODEL || getRaw(RERANK_MODEL_KEY);
  if (isRerankModelId(raw)) return raw;
  return DEFAULT_CLAW_RERANK_MODEL;
}

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
  const topN = typeof input.topN === "number" ? Math.max(1, input.topN) : passages.length;
  const body = {
    model,
    query: input.query,
    documents: passages.map((text) => text.slice(0, 3000)),
    top_n: topN
  };

  const timeoutController = new AbortController();
  const t = setTimeout(() => timeoutController.abort(new Error("Bitdeer rerank timed out after 15s")), 15_000);
  const signal = input.signal ? AbortSignal.any([input.signal, timeoutController.signal]) : timeoutController.signal;

  try {
    const { url, extraHeaders } = heliconeRoute(`${NVIDIA_BASE}/rerank`);
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
      console.warn(`[bitdeer] rerank HTTP ${r.status} for model ${model} (body ${redact(text)})`);
      if (r.status === 401 || r.status === 403) throw new NvidiaAuthError(`Bitdeer rejected the API key (HTTP ${r.status})`);
      throw new NvidiaUpstreamError(`Bitdeer rerank HTTP ${r.status}: ${redact(text)}`, r.status);
    }
    const json = (await r.json()) as {
      results?: Array<{ index?: number; relevance_score?: number; logit?: number }>;
      rankings?: Array<{ index?: number; logit?: number }>;
    };
    const rows = Array.isArray(json.results) ? json.results : (Array.isArray(json.rankings) ? json.rankings : []);
    const cleaned = rows
      .filter((x) => typeof x.index === "number" && x.index >= 0 && x.index < passages.length)
      .map((x) => ({
        index: x.index as number,
        score: typeof x.relevance_score === "number" ? x.relevance_score : (typeof x.logit === "number" ? x.logit : 0)
      }));
    cleaned.sort((a, b) => b.score - a.score);
    return cleaned.slice(0, topN);
  } finally {
    clearTimeout(t);
  }
}
