// lib/nvidia/embed.ts — NVIDIA NIM text embeddings for Claw's dev-skills RAG.
//
// AUDIT 2026-09-03: both NVIDIA embed models are EOL:
//   nv-embedqa-e5-v5        → 410 Gone (EOL 2026-08-25)
//   llama-3.2-nv-embedqa-1b-v2 → 410 Gone (EOL 2026-05-18)
//
// The dev-skills RAG falls back to keyword-only search automatically
// (lib/claw/dev-skills.ts). Embedding is not required for MVP operation.
// When NVIDIA hosts a new embed model on this endpoint, re-enable here
// and recreate the vector index.
//
// NVIDIA's hosted embedding endpoint (when re-enabled):
//   POST https://integrate.api.nvidia.com/v1/embeddings
//   Authorization: Bearer $NVIDIA_API_KEY
//   { "model": "<model>",
//     "input": ["passage 1", "passage 2", ...],
//     "input_type": "passage" | "query",
//     "truncate": "END" }
// → { "data": [ { "index": 0, "embedding": [ ...dim floats ] }, ... ] }
//
// When switching models, update the pgvector column dimension in
// migrations/006_dev_skill_vectors.sql to match the new model's output dim.

import { NVIDIA_BASE } from "./models";
import { getNvidiaApiKey, NvidiaAuthError, NvidiaUpstreamError } from "./client";
import { heliconeRoute } from "./helicone";
import { db } from "@/lib/db";

export type EmbedModelId =
  | "nvidia/nv-embedqa-e5-v5"
  | "nvidia/llama-3.2-nv-embedqa-1b-v2";

export const EMBED_MODELS: Record<EmbedModelId, { id: EmbedModelId; label: string; dim: number; notes: string }> = {
  "nvidia/nv-embedqa-e5-v5": {
    id: "nvidia/nv-embedqa-e5-v5",
    label: "NV-EmbedQA E5 v5 (default) ⚠️",
    dim: 1024,
    notes: "[EOL 2026-08-25] 1024-dim QA retrieval embedding. Currently unavailable — dev-skills RAG uses keyword fallback."
  },
  "nvidia/llama-3.2-nv-embedqa-1b-v2": {
    id: "nvidia/llama-3.2-nv-embedqa-1b-v2",
    label: "Llama 3.2 NV-EmbedQA 1B v2 ⚠️",
    dim: 2048,
    notes: "[EOL 2026-05-18] 2048-dim. Currently unavailable — dev-skills RAG uses keyword fallback."
  }
};

export const DEFAULT_CLAW_EMBED_MODEL: EmbedModelId = "nvidia/nv-embedqa-e5-v5";

/** The embedding vector dimension the default model produces. The
 *  pgvector column type (migrations/006) MUST match this. */
export const EMBED_DIM = EMBED_MODELS[DEFAULT_CLAW_EMBED_MODEL].dim;

const EMBED_MODEL_KEY = "claw_embed_model";

function getRaw(key: string): string | null {
  return (db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined)?.value ?? null;
}

export function isEmbedModelId(v: unknown): v is EmbedModelId {
  return typeof v === "string" && v in EMBED_MODELS;
}

/** Embedding model Claw uses. Env var wins, then persisted setting,
 *  then the 1024-dim default. Mirrors getClawModel()/getClawRerankModel(). */
export function getClawEmbedModel(): EmbedModelId {
  const raw = process.env.CLAW_EMBED_MODEL || getRaw(EMBED_MODEL_KEY);
  if (isEmbedModelId(raw)) return raw;
  return DEFAULT_CLAW_EMBED_MODEL;
}

/** Embeddings reuse the single NVIDIA key. Without it we can't embed,
 *  so the vector store stays empty and retrieval falls back to keyword. */
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

/**
 * Embed one or more texts. `inputType` MUST be "passage" when indexing
 * documents and "query" when embedding a search query — nv-embedqa is
 * asymmetric and mixing them degrades recall. Returns one Float32-ish
 * number[] per input, in input order. Throws NvidiaAuthError (missing
 * key) or NvidiaUpstreamError (non-2xx) so callers can fall back.
 */
export async function embedTexts(input: {
  texts: string[];
  inputType: "query" | "passage";
  model?: EmbedModelId;
  signal?: AbortSignal;
}): Promise<number[][]> {
  const texts = (input.texts ?? []).filter((t) => typeof t === "string");
  if (texts.length === 0) return [];

  let key: string;
  try {
    key = getNvidiaApiKey();
  } catch (e) {
    if (e instanceof NvidiaAuthError) throw e;
    throw new NvidiaAuthError(e instanceof Error ? e.message : String(e));
  }

  const model = input.model ?? getClawEmbedModel();
  const body = {
    model,
    // Cap each input so a long skill body can't overflow the model's
    // context; "END" truncation is the server-side backstop.
    input: texts.map((t) => t.slice(0, 3000)),
    input_type: input.inputType,
    truncate: "END" as const
  };

  const timeoutController = new AbortController();
  const t = setTimeout(() => timeoutController.abort(new Error("NVIDIA embed timed out after 20s")), 20_000);
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
      // never log input content — it may include the operator's own material
      console.warn(`[nvidia] embed HTTP ${r.status} for model ${model} (body ${redact(text)})`);
      if (r.status === 401 || r.status === 403) throw new NvidiaAuthError(`NVIDIA rejected the API key (HTTP ${r.status})`);
      throw new NvidiaUpstreamError(`NVIDIA embed HTTP ${r.status}: ${redact(text)}`, r.status);
    }
    const json = (await r.json()) as { data?: Array<{ index?: number; embedding?: number[] }> };
    const rows = Array.isArray(json.data) ? json.data : [];
    // Re-order defensively by `index` so we always align with `texts`.
    const out: number[][] = new Array(texts.length);
    rows.forEach((row, i) => {
      const idx = typeof row.index === "number" ? row.index : i;
      if (Array.isArray(row.embedding) && idx >= 0 && idx < texts.length) out[idx] = row.embedding;
    });
    // Fill any gaps (shouldn't happen) so callers never hit undefined.
    for (let i = 0; i < out.length; i++) if (!out[i]) out[i] = [];
    return out;
  } finally {
    clearTimeout(t);
  }
}

/** Convenience: embed a single query string. */
export async function embedQuery(text: string, signal?: AbortSignal): Promise<number[]> {
  const [vec] = await embedTexts({ texts: [text], inputType: "query", signal });
  return vec ?? [];
}
