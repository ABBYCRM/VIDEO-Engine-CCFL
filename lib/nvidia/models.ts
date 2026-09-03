// NVIDIA NIM model registry for the Content Intelligence and Monitor subsystems.
//
// NVIDIA's build endpoint is OpenAI-compatible: POST /v1/chat/completions on
// https://integrate.api.nvidia.com/v1/chat/completions with
//   Authorization: Bearer $NVIDIA_API_KEY
//
// AUDIT 2026-09-03: live key curl tests against integrate.api.nvidia.com:
//   ✅ meta/llama-3.2-11b-vision-instruct   → 200 OK (default, confirmed 2026-09-03)
//   ✅ deepseek-ai/deepseek-v4-flash-0731     → 200 OK (confirmed 2026-09-03)
//   ✅ deepseek-ai/deepseek-v4-pro-0813       → 200 OK (confirmed 2026-09-03)
//   ❌ ai21labs/jamba-1.5-large-instruct     → 404 Not Found for this account
//   ❌ nvidia/llama-3.1-nemotron-ultra-253b-v1 → 404 Not Found for this account
//   ❌ mistralai/mistral-large                → 404 Not Found for this account
//   ❌ meta/llama-3.2-90b-vision-instruct     → timeout / unreachable (treat as unavailable)
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
  | "meta/llama-3.2-90b-vision-instruct"
  | "nvidia/llama-3.1-nemotron-ultra-253b-v1"
  | "deepseek-ai/deepseek-v4-flash-0731"
  | "deepseek-ai/deepseek-v4-pro-0813"
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
    label: "Llama 3.2 11B Vision Instruct (default)",
    capabilities: ["chat", "vision", "json-mode"],
    contextWindow: 131072,
    costTier: "low",
    notes: "Default for Claw + content intelligence. Confirmed working 2026-08-27 + 2026-09-03. Text-only deltas, no reasoning trace.",
    emitsReasoning: false
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
  "deepseek-ai/deepseek-v4-flash-0731": {
    id: "deepseek-ai/deepseek-v4-flash-0731",
    label: "DeepSeek V4 Flash (0731)",
    capabilities: ["chat", "json-mode"],
    contextWindow: 131072,
    costTier: "low",
    notes: "Cheap + fast. Emits a `reasoning_content` thinking trace that the streaming client strips automatically. Good for monitoring. Confirmed working 2026-09-03.",
    emitsReasoning: true
  },
  "deepseek-ai/deepseek-v4-pro-0813": {
    id: "deepseek-ai/deepseek-v4-pro-0813",
    label: "DeepSeek V4 Pro (0813)",
    capabilities: ["chat", "json-mode"],
    contextWindow: 131072,
    costTier: "mid",
    notes: "Larger DeepSeek — stronger reasoning, slightly higher latency. Same reasoning-trace handling as the Flash variant. Confirmed working 2026-09-03.",
    emitsReasoning: true
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
