// lib/nvidia/embed.ts — NVIDIA NIM text embeddings for Claw's dev-skills RAG.
//
// NVIDIA's hosted embedding endpoint:
//   POST https://integrate.api.nvidia.com/v1/embeddings
//   Authorization: Bearer $NVIDIA_API_KEY
//   { "model": "nvidia/nemotron-3-embed-1b",
//     "input": ["passage 1", "passage 2", ...],
//     "input_type": "passage" | "query",
//     "truncate": "END",
//     "dimensions": 2048 }
//
// Nemotron 3 Embed 1B returns native 2048-dimensional float embeddings.
// The pgvector column dimension in migrations/006 and vector-store.ts MUST
// remain aligned with EMBED_DIM. Legacy embed IDs are retained only so an
// old persisted setting can be recognized and reported; they are not the
// default and should not be selected for new indexing.

import { NVIDIA_BASE } from "./models";
import { getNvidiaApiKey, NvidiaAuthError, NvidiaUpstreamError } from "./client";
import { heliconeRoute } from "./helicone";
import { db } from "@/lib/db";

export type EmbedModelId =
  | "nvidia/Nemotron-3-Embed-1B-BF16"
  | "nvidia/nemotron-3-embed-1b"
  | "nvidia/nv-embedqa-e5-v5"
  | "nvidia/llama-3.2-nv-embedqa-1b-v2";

export const EMBED_MODELS: Record<
  EmbedModelId,
  { id: EmbedModelId; label: string; dim: number; notes: string; active: boolean }
> = {
  "nvidia/Nemotron-3-Embed-1B-BF16": {
    id: "nvidia/Nemotron-3-Embed-1B-BF16",
    label: "Nemotron 3 Embed 1B (Bitdeer) ★ default",
    dim: 2048,
    notes: "Bitdeer-hosted Nemotron 3 Embed 1B. Native float output is 2048 dimensions.",
    active: true
  },
  "nvidia/nemotron-3-embed-1b": {
    id: "nvidia/nemotron-3-embed-1b",
    label: "Nemotron 3 Embed 1B (legacy id)",
    dim: 2048,
    notes: "Legacy NVIDIA.com model id. Rewritten to nvidia/Nemotron-3-Embed-1B-BF16 on Bitdeer.",
    active: false
  },
  "nvidia/nv-embedqa-e5-v5": {
    id: "nvidia/nv-embedqa-e5-v5",
    label: "NV-EmbedQA E5 v5 (legacy)",
    dim: 1024,
    notes: "Legacy model retained for persisted-setting compatibility. Do not use for new indexes.",
    active: false
  },
  "nvidia/llama-3.2-nv-embedqa-1b-v2": {
    id: "nvidia/llama-3.2-nv-embedqa-1b-v2",
    label: "Llama 3.2 NV-EmbedQA 1B v2 (legacy)",
    dim: 2048,
    notes: "Legacy model retained for persisted-setting compatibility. Do not use for new indexes.",
    active: false
  }
};

export const DEFAULT_CLAW_EMBED_MODEL: EmbedModelId = "nvidia/Nemotron-3-Embed-1B-BF16";
const LEGACY_TO_BITDEER: Partial<Record<EmbedModelId, EmbedModelId>> = {
  "nvidia/nemotron-3-embed-1b": "nvidia/Nemotron-3-Embed-1B-BF16"
};

/** The embedding vector dimension the default model produces. The
 * pgvector column type MUST match this. */
export const EMBED_DIM = EMBED_MODELS[DEFAULT_CLAW_EMBED_MODEL].dim;

const EMBED_MODEL_KEY = "claw_embed_model";

function getRaw(key: string): string | null {
  return (db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined)?.value ?? null;
}

export function isEmbedModelId(v: unknown): v is EmbedModelId {
  return typeof v === "string" && Object.hasOwn(EMBED_MODELS, v);
}

/** Embedding model Claw uses. Env var wins, then persisted setting, then
 * the active 2048-dimensional default. Legacy configured IDs are accepted
 * only when explicitly selected so existing installations fail visibly at
 * the upstream instead of being silently rewritten. */
export function getClawEmbedModel(): EmbedModelId {
  const raw = process.env.CLAW_EMBED_MODEL || process.env.BITDEER_EMBED_MODEL || getRaw(EMBED_MODEL_KEY);
  if (isEmbedModelId(raw)) return LEGACY_TO_BITDEER[raw] || raw;
  return DEFAULT_CLAW_EMBED_MODEL;
}

/** Embeddings reuse the NVIDIA key. */
export function isEmbedConfigured(): boolean {
  try {
    getNvidiaApiKey();
    return true;
  } catch {
    return false;
  }
}

function redact(s: string, max = 280): string {
  return s.length <= max ? s : s.slice(0, max) + `… (+${s.length - max} chars)`;
}

function assertValidEmbedding(vector: unknown, expectedDim: number, index: number): asserts vector is number[] {
  if (!Array.isArray(vector)) {
    throw new NvidiaUpstreamError(`Bitdeer embedding response missing vector at index ${index}`, 502);
  }
  if (vector.length !== expectedDim) {
    throw new NvidiaUpstreamError(
      `Bitdeer embedding dimension mismatch at index ${index}: expected ${expectedDim}, received ${vector.length}`,
      502
    );
  }
  if (!vector.every((value) => typeof value === "number" && Number.isFinite(value))) {
    throw new NvidiaUpstreamError(`Bitdeer embedding response contained non-finite values at index ${index}`, 502);
  }
}

/**
 * Embed one or more texts. `inputType` MUST be "passage" when indexing
 * documents and "query" when embedding a search query. Returns one vector
 * per input, in input order. Malformed or dimensionally inconsistent
 * upstream responses fail closed instead of silently producing an invalid
 * pgvector index.
 */
export async function embedTexts(input: {
  texts: string[];
  inputType: "query" | "passage";
  model?: EmbedModelId;
  signal?: AbortSignal;
}): Promise<number[][]> {
  const texts = (input.texts ?? []).filter((t) => typeof t === "string" && t.trim().length > 0);
  if (texts.length === 0) return [];

  let key: string;
  try {
    key = getNvidiaApiKey();
  } catch (e) {
    if (e instanceof NvidiaAuthError) throw e;
    throw new NvidiaAuthError(e instanceof Error ? e.message : String(e));
  }

  const requested = input.model ?? getClawEmbedModel();
  const model = LEGACY_TO_BITDEER[requested] || requested;
  const meta = EMBED_MODELS[model] ?? EMBED_MODELS[DEFAULT_CLAW_EMBED_MODEL];
  const body: Record<string, unknown> = {
    model,
    input: texts.map((t) => t.slice(0, 12_000))
  };

  const timeoutController = new AbortController();
  const t = setTimeout(() => timeoutController.abort(new Error("Bitdeer embed timed out after 20s")), 20_000);
  const signal = input.signal ? AbortSignal.any([input.signal, timeoutController.signal]) : timeoutController.signal;

  try {
    const { url, extraHeaders } = heliconeRoute(`${NVIDIA_BASE}/embeddings`);
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
      console.warn(`[bitdeer] embed HTTP ${r.status} for model ${model} (body ${redact(text)})`);
      if (r.status === 401 || r.status === 403) {
        throw new NvidiaAuthError(`Bitdeer rejected the API key (HTTP ${r.status})`);
      }
      throw new NvidiaUpstreamError(`Bitdeer embed HTTP ${r.status}: ${redact(text)}`, r.status);
    }

    const json = (await r.json()) as { data?: Array<{ index?: number; embedding?: unknown }> };
    const rows = Array.isArray(json.data) ? json.data : [];
    if (rows.length !== texts.length) {
      throw new NvidiaUpstreamError(
        `Bitdeer embedding response count mismatch: expected ${texts.length}, received ${rows.length}`,
        502
      );
    }

    const out: Array<number[] | undefined> = new Array(texts.length);
    rows.forEach((row, responseIndex) => {
      const idx = typeof row.index === "number" ? row.index : responseIndex;
      if (!Number.isInteger(idx) || idx < 0 || idx >= texts.length || out[idx]) {
        throw new NvidiaUpstreamError(`Bitdeer embedding response contained invalid index ${String(idx)}`, 502);
      }
      assertValidEmbedding(row.embedding, meta.dim, idx);
      out[idx] = row.embedding;
    });

    return out.map((vector, index) => {
      assertValidEmbedding(vector, meta.dim, index);
      return vector;
    });
  } finally {
    clearTimeout(t);
  }
}

/** Convenience: embed a single query string. */
export async function embedQuery(text: string, signal?: AbortSignal): Promise<number[]> {
  const [vec] = await embedTexts({ texts: [text], inputType: "query", signal });
  return vec ?? [];
}
