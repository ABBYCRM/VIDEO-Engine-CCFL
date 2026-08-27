// NVIDIA NIM model registry for the Content Intelligence and Monitor subsystems.
//
// NVIDIA's build endpoint is OpenAI-compatible: POST /v1/chat/completions on
// https://integrate.api.nvidia.com/v1/chat/completions with
//   Authorization: Bearer $NVIDIA_API_KEY
//
// The catalog below was rebuilt on 2026-08-27 after a large portion of the
// previously supported models (Llama 3.1 70B, Llama 3.3 70B, Nemotron 3.5
// Lightning, Nemotron Mini 4B) all reached end-of-life on 2026-08-26
// (HTTP 410 Gone from the build endpoint, returns no body for streaming).
//
// The new default — meta/llama-3.2-11b-vision-instruct — was confirmed working
// from the sandbox at 2026-08-27 14:25 ET (non-stream 30ms, stream 250ms,
// clean text-only deltas, no `reasoning_content`).
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
    notes: "Default for Claw + content intelligence. Confirmed working 2026-08-27. Text-only deltas, no reasoning trace.",
    emitsReasoning: false
  },
  "meta/llama-3.2-90b-vision-instruct": {
    id: "meta/llama-3.2-90b-vision-instruct",
    label: "Llama 3.2 90B Vision Instruct",
    capabilities: ["chat", "vision", "json-mode"],
    contextWindow: 131072,
    costTier: "high",
    notes: "Larger Llama 3.2 — same simple delta format, slower but stronger. Good for the most complex structured-JSON generation.",
    emitsReasoning: false
  },
  "nvidia/llama-3.1-nemotron-ultra-253b-v1": {
    id: "nvidia/llama-3.1-nemotron-ultra-253b-v1",
    label: "Nemotron Ultra 253B v1",
    capabilities: ["chat", "json-mode"],
    contextWindow: 131072,
    costTier: "high",
    notes: "NVIDIA's largest Nemotron for top-quality reasoning. Use for long-form strategy / audit synthesis.",
    emitsReasoning: false
  },
  "deepseek-ai/deepseek-v4-flash-0731": {
    id: "deepseek-ai/deepseek-v4-flash-0731",
    label: "DeepSeek V4 Flash (0731)",
    capabilities: ["chat", "json-mode"],
    contextWindow: 131072,
    costTier: "low",
    notes: "Cheap + fast. Emits a `reasoning_content` thinking trace that the streaming client strips automatically. Good for monitoring.",
    emitsReasoning: true
  },
  "deepseek-ai/deepseek-v4-pro-0813": {
    id: "deepseek-ai/deepseek-v4-pro-0813",
    label: "DeepSeek V4 Pro (0813)",
    capabilities: ["chat", "json-mode"],
    contextWindow: 131072,
    costTier: "mid",
    notes: "Larger DeepSeek — stronger reasoning, slightly higher latency. Same reasoning-trace handling as the Flash variant.",
    emitsReasoning: true
  },
  "mistralai/mistral-large": {
    id: "mistralai/mistral-large",
    label: "Mistral Large",
    capabilities: ["chat", "json-mode"],
    contextWindow: 131072,
    costTier: "mid",
    notes: "Strong European-multilingual support. Useful for non-English copy variants.",
    emitsReasoning: false
  },
  "ai21labs/jamba-1.5-large-instruct": {
    id: "ai21labs/jamba-1.5-large-instruct",
    label: "AI21 Jamba 1.5 Large",
    capabilities: ["chat", "json-mode"],
    contextWindow: 256000,
    costTier: "mid",
    notes: "Hybrid SSM-Transformer with 256K context. Best when the conversation history is long (Claw with many tool turns).",
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
