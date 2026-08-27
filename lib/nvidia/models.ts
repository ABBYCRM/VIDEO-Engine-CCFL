// NVIDIA NIM model registry for the Content Intelligence and Monitor subsystems.
//
// NVIDIA's build endpoint is OpenAI-compatible: POST /v1/chat/completions on
// https://integrate.api.nvidia.com/v1/chat/completions with
//   Authorization: Bearer $NVIDIA_API_KEY
// The full model catalog is documented at
//   https://docs.api.nvidia.com/nim/reference/llm-api
// but only the chat-completions-capable models we actually use are listed here
// so that the Settings UI is not a marketing dump.
//
// We deliberately do NOT hard-code model behavior in routes — every call site
// asks the registry for a configured model id, validates it, and only then
// dispatches. Swapping models in Settings must not require code changes.

export type NvidiaCapability = "chat" | "vision" | "json-mode";

export type NvidiaModelId =
  | "meta/llama-3.1-70b-instruct"
  | "meta/llama-3.3-70b-instruct"
  | "nvidia/nvidia-nemotron-nano-9b-v2"
  | "nvidia/llama-3.1-nemotron-70b-instruct"
  | "nvidia/nemotron-mini-4b-instruct"
  | "mistralai/mistral-large-2-instruct"
  | "disabled";

export const NVIDIA_MODELS: Record<NvidiaModelId, {
  id: NvidiaModelId;
  label: string;
  capabilities: NvidiaCapability[];
  contextWindow: number;
  costTier: "low" | "mid" | "high";
  notes: string;
}> = {
  "meta/llama-3.1-70b-instruct": {
    id: "meta/llama-3.1-70b-instruct",
    label: "Llama 3.1 70B Instruct",
    capabilities: ["chat", "json-mode"],
    contextWindow: 131072,
    costTier: "high",
    notes: "Default for content intelligence — strongest structured-JSON output in the catalog."
  },
  "nvidia/nvidia-nemotron-nano-9b-v2": {
    id: "nvidia/nvidia-nemotron-nano-9b-v2",
    label: "NVIDIA Nemotron Nano 9B v2",
    capabilities: ["chat", "json-mode"],
    contextWindow: 131072,
    costTier: "low",
    notes: "Fast hybrid Mamba-Transformer model for agentic chat, instruction following, and tool use."
  },
  "meta/llama-3.3-70b-instruct": {
    id: "meta/llama-3.3-70b-instruct",
    label: "Llama 3.3 70B Instruct",
    capabilities: ["chat", "json-mode"],
    contextWindow: 131072,
    costTier: "high",
    notes: "Newer reasoning-tuned 70B. Good fallback when 3.1 70B rate-limits."
  },
  "nvidia/llama-3.1-nemotron-70b-instruct": {
    id: "nvidia/llama-3.1-nemotron-70b-instruct",
    label: "Llama 3.1 Nemotron 70B (NVIDIA-tuned)",
    capabilities: ["chat", "json-mode"],
    contextWindow: 131072,
    costTier: "high",
    notes: "NVIDIA-aligned Nemotron 70B. Strong at instruction-following + structured output. Backward-compatible default for the existing monitor config."
  },
  "nvidia/nemotron-mini-4b-instruct": {
    id: "nvidia/nemotron-mini-4b-instruct",
    label: "Nemotron Mini 4B Instruct",
    capabilities: ["chat", "json-mode"],
    contextWindow: 8192,
    costTier: "low",
    notes: "Ultra-cheap, fast monitor summarizer. Use only for short KPI digests."
  },
  "mistralai/mistral-large-2-instruct": {
    id: "mistralai/mistral-large-2-instruct",
    label: "Mistral Large 2 Instruct",
    capabilities: ["chat", "json-mode"],
    contextWindow: 131072,
    costTier: "high",
    notes: "Strong European-multilingual support. Useful for non-English copy variants."
  },
  "disabled": {
    id: "disabled",
    label: "Disabled",
    capabilities: [],
    contextWindow: 0,
    costTier: "low",
    notes: "NVIDIA subsystems are turned off. Content generation and monitor will return dormant / null."
  }
};

export const DEFAULT_CLAW_NVIDIA_MODEL: NvidiaModelId = "nvidia/nvidia-nemotron-nano-9b-v2";

export const NVIDIA_BASE = "https://integrate.api.nvidia.com/v1";

export function isNvidiaModelId(v: unknown): v is NvidiaModelId {
  return typeof v === "string" && v in NVIDIA_MODELS;
}

export function listNvidiaModelIds(): NvidiaModelId[] {
  return Object.keys(NVIDIA_MODELS) as NvidiaModelId[];
}
