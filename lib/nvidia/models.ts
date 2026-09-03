// NVIDIA NIM model registry for the Content Intelligence and Monitor subsystems.
//
// NVIDIA's build endpoint is OpenAI-compatible: POST /v1/chat/completions on
// https://integrate.api.nvidia.com/v1/chat/completions with
//   Authorization: Bearer $NVIDIA_API_KEY
//
// AUDIT 2026-09-03 SPEED TEST (3 trials each, "Say PONG" prompt):
//   ✅ meta/llama-3.2-11b-vision-instruct       262–460ms   FASTEST — default for Claw
//   ✅ nvidia/nemotron-3-super-120b-a12b         384–606ms   FAST — 120B param blend, sometimes verbose
//   ✅ nvidia/nemotron-3-nano-omni-30b-a3b       421–1346ms  FAST — reasoning model, compact
//   ⚠️  deepseek-ai/deepseek-v4-pro-0813          2154–7930ms WORKS — wildly variable (2–8s), use for non-latency-sensitive tasks
//   ⛔  deepseek-ai/deepseek-v4-flash-0731         ALL FAIL   Unreliable — 529 errors + timeouts + TypeError
//   ⛔  nvidia/nemotron-3-ultra-550b-a55b          18184–19980ms Works but 18–20s — too slow for interactive use
//   ❌  ALL OTHER MODELS TESTED                     HTTP 404      Not accessible with this NVIDIA_API_KEY:
//       mistralai/mistral-large, mistralai/mistral-7b-instruct-v0.3,
//       mistralai/codestral-22b-instruct-v0.1, mistralai/mistral-large-2-instruct,
//       google/gemma-2b, google/gemma-3-4b-it, google/gemma-3-12b-it, google/gemma-4-31b-it,
//       ibm/granite-3.0-8b-instruct, meta/codellama-70b, meta/llama2-70b,
//       nvidia/llama-3.1-nemotron-51b-instruct, nvidia/llama-3.1-nemotron-70b-instruct,
//       nvidia/llama-3.1-nemotron-ultra-253b-v1, nvidia/nemotron-4-340b-instruct,
//       nvidia/nemotron-4-340b-reward, nvidia/llama3-chatqa-1.5-70b, deepseek-ai/deepseek-coder-6.7b-instruct,
//       microsoft/phi-3.5-moe-instruct, nvidia/mistral-nemo-minitron-8b-8k-instruct
//
// AUDIT 2026-09-03: EMBEDDINGS & RERANKER:
//   ❌ EMBEDDINGS — both nv-embedqa-e5-v5 AND llama-3.2-nv-embedqa-1b-v2
//                     → 410 Gone (EOL 2026-08-25). Dev-skills RAG falls back to
//                     keyword search; no embeddings required for MVP operation.
//   ❌ RERANKER — nvidia/llama-3.2-nv-rerankqa-1b-v2
//                   → 404 Not Found. Falls back to keyword order.
//
// When the operator has a different key that includes more models, re-enable
// entries by removing the "(key: unavailable)" annotation from notes.
//
// We deliberately do NOT hard-code model behavior in routes — every call site
// asks the registry for a configured model id, validates it, and only then
// dispatches. Swapping models in Settings must not require code changes.

export type NvidiaCapability = "chat" | "vision" | "json-mode";

export type NvidiaModelId =
  | "meta/llama-3.2-11b-vision-instruct"
  | "nvidia/nemotron-3-super-120b-a12b"
  | "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning"
  | "deepseek-ai/deepseek-v4-pro-0813"
  | "deepseek-ai/deepseek-v4-flash-0731"
  | "meta/llama-3.2-90b-vision-instruct"
  | "nvidia/llama-3.1-nemotron-ultra-253b-v1"
  | "mistralai/mistral-large"
  | "ai21labs/jamba-1.5-large-instruct"
  | "disabled";

export const NVIDIA_MODELS: Record<NvidiaModelId, {
  id: NvidiaModelId;
  label: string;
  capabilities: NvidiaCapability[];
  contextWindow: number;
  costTier: "low" | "mid" | "high";
  notes: string;
  // Some models emit a `reasoning_content` delta field that the operator-facing
  // stream should strip. The registry is the single source of truth.
  emitsReasoning: boolean;
}> = {
  "meta/llama-3.2-11b-vision-instruct": {
    id: "meta/llama-3.2-11b-vision-instruct",
    label: "Llama 3.2 11B Vision Instruct ★ default",
    capabilities: ["chat", "vision", "json-mode"],
    contextWindow: 131072,
    costTier: "low",
    notes: "DEFAULT — fastest + most reliable at 262–460ms. Vision-capable. Text-only deltas, no reasoning trace.",
    emitsReasoning: false
  },
  "nvidia/nemotron-3-super-120b-a12b": {
    id: "nvidia/nemotron-3-super-120b-a12b",
    label: "Nemotron 3 Super 120B",
    capabilities: ["chat", "json-mode"],
    contextWindow: 131072,
    costTier: "mid",
    notes: "FAST at 384–606ms. 120B param blend model. Can be verbose — worth it for speed. Confirmed working 2026-09-03.",
    emitsReasoning: false
  },
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning": {
    id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
    label: "Nemotron 3 Nano Omni 30B (reasoning)",
    capabilities: ["chat", "json-mode"],
    contextWindow: 131072,
    costTier: "low",
    notes: "FAST at 421–1346ms. Reasoning model — thinks before responding. Compact and reliable. Confirmed working 2026-09-03.",
    emitsReasoning: false
  },
  "deepseek-ai/deepseek-v4-pro-0813": {
    id: "deepseek-ai/deepseek-v4-pro-0813",
    label: "DeepSeek V4 Pro (0813)",
    capabilities: ["chat", "json-mode"],
    contextWindow: 131072,
    costTier: "mid",
    notes: "SLOWER — 2–8s latency (highly variable). Emits reasoning_content trace. Use for non-interactive tasks where quality > speed. Confirmed working 2026-09-03.",
    emitsReasoning: true
  },
  "deepseek-ai/deepseek-v4-flash-0731": {
    id: "deepseek-ai/deepseek-v4-flash-0731",
    label: "DeepSeek V4 Flash (0731) ⚠️",
    capabilities: ["chat", "json-mode"],
    contextWindow: 131072,
    costTier: "low",
    notes: "[⚠️ unreliable] Cheap + fast when it works, but the current NVIDIA_API_KEY returns 529 errors and timeouts on this model. Avoid for production use until the key is updated.",
    emitsReasoning: true
  },
  "meta/llama-3.2-90b-vision-instruct": {
    id: "meta/llama-3.2-90b-vision-instruct",
    label: "Llama 3.2 90B Vision Instruct",
    capabilities: ["chat", "vision", "json-mode"],
    contextWindow: 131072,
    costTier: "high",
    notes: "[key: unavailable] Larger Llama 3.2 — same simple delta format, slower but stronger. Not accessible with the current NVIDIA_API_KEY (request times out).",
    emitsReasoning: false
  },
  "nvidia/llama-3.1-nemotron-ultra-253b-v1": {
    id: "nvidia/llama-3.1-nemotron-ultra-253b-v1",
    label: "Nemotron Ultra 253B v1",
    capabilities: ["chat", "json-mode"],
    contextWindow: 131072,
    costTier: "high",
    notes: "[key: unavailable] NVIDIA's largest Nemotron for top-quality reasoning. Not accessible with the current NVIDIA_API_KEY (HTTP 404).",
    emitsReasoning: false
  },
  "mistralai/mistral-large": {
    id: "mistralai/mistral-large",
    label: "Mistral Large",
    capabilities: ["chat", "json-mode"],
    contextWindow: 131072,
    costTier: "mid",
    notes: "[key: unavailable] Strong European-multilingual support. Not accessible with the current NVIDIA_API_KEY (HTTP 404).",
    emitsReasoning: false
  },
  "ai21labs/jamba-1.5-large-instruct": {
    id: "ai21labs/jamba-1.5-large-instruct",
    label: "AI21 Jamba 1.5 Large",
    capabilities: ["chat", "json-mode"],
    contextWindow: 256000,
    costTier: "mid",
    notes: "[key: unavailable] Hybrid SSM-Transformer with 256K context. Not accessible with the current NVIDIA_API_KEY (HTTP 404).",
    emitsReasoning: false
  },
  "disabled": {
    id: "disabled",
    label: "Disabled",
    capabilities: [],
    contextWindow: 0,
    costTier: "low",
    notes: "NVIDIA subsystems are turned off. Content generation and monitor will return dormant / null.",
    emitsReasoning: false
  }
};

export const DEFAULT_CLAW_NVIDIA_MODEL: NvidiaModelId = "meta/llama-3.2-11b-vision-instruct";

export const NVIDIA_BASE = "https://integrate.api.nvidia.com/v1";

export function isNvidiaModelId(v: unknown): v is NvidiaModelId {
  return typeof v === "string" && v in NVIDIA_MODELS;
}

export function listNvidiaModelIds(): NvidiaModelId[] {
  return Object.keys(NVIDIA_MODELS) as NvidiaModelId[];
}

/** Read the registered model record for the given id. */
export function getNvidiaModelMeta(id: NvidiaModelId) {
  return NVIDIA_MODELS[id];
}
