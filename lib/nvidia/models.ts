// NVIDIA NIM model registry for Claw.
//
// NVIDIA's build endpoint is OpenAI-compatible: POST /v1/chat/completions on
// https://integrate.api.nvidia.com/v1/chat/completions.
//
// Aion-Brain / VIDEO claw contract (do not invent):
//   AGENT_MODEL  = nvidia/nemotron-3-ultra-550b-a55b   (Claw default)
//   PRIMARY_MODEL = nvidia/nemotron-3-super-120b-a12b  (confirmed on integrate.api.nvidia.com)
//   FALLBACK_MODELS = moonshotai/kimi-k2.6, super, nano-omni, …
//
// MULTI-KEY POOL (2026-09-03):
//   All operator keys are stored as an encrypted JSON array in settings DB
//   (key: nvidia_api_keys). The client cycles through keys on retryable errors
//   (HTTP 429 rate limit, 529/503/504 server errors, network timeout, TypeError).
//   HTTP 401/403 = bad key (skip); HTTP 404 = model not on this key (fail fast).

export type NvidiaCapability = "chat" | "vision" | "json-mode" | "tools";

export type NvidiaModelId =
  | "nvidia/nemotron-3-ultra-550b-a55b"
  | "moonshotai/kimi-k3"
  | "moonshotai/kimi-k2.6"
  | "nvidia/nemotron-3-super-120b-a12b"
  | "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning"
  | "meta/llama-3.2-11b-vision-instruct"
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
  emitsReasoning: boolean;
  toolCalling: boolean;
  preserveAssistantPayload: boolean;
}> = {
  "nvidia/nemotron-3-ultra-550b-a55b": {
    id: "nvidia/nemotron-3-ultra-550b-a55b",
    label: "Nemotron 3 Ultra 550B ★ agent default",
    capabilities: ["chat", "json-mode", "tools"],
    contextWindow: 1048576,
    costTier: "high",
    notes: "AGENT default. Native tool calling + reasoning. When tools are sent, chat_template_kwargs.enable_thinking and force_nonempty_content must be set. Falls back to PRIMARY Super if Ultra 404s on the key pool.",
    emitsReasoning: true,
    toolCalling: true,
    preserveAssistantPayload: true
  },
  "moonshotai/kimi-k3": {
    id: "moonshotai/kimi-k3",
    label: "Kimi K3 (Moonshot)",
    capabilities: ["chat", "vision", "json-mode", "tools"],
    contextWindow: 1048576,
    costTier: "high",
    notes: "Native multimodal agentic model. MUST echo the full assistant message including reasoning_content + tool_calls on every follow-up turn.",
    emitsReasoning: true,
    toolCalling: true,
    preserveAssistantPayload: true
  },
  "moonshotai/kimi-k2.6": {
    id: "moonshotai/kimi-k2.6",
    label: "Kimi K2.6 (Moonshot)",
    capabilities: ["chat", "json-mode", "tools"],
    contextWindow: 262144,
    costTier: "mid",
    notes: "Agentic tool-calling fallback in the Kimi family. Preserve reasoning_content + tool_calls across turns. If the account returns 404, use kimi-k3 or Nemotron Ultra.",
    emitsReasoning: true,
    toolCalling: true,
    preserveAssistantPayload: true
  },
  "nvidia/nemotron-3-super-120b-a12b": {
    id: "nvidia/nemotron-3-super-120b-a12b",
    label: "Nemotron 3 Super 120B ★ primary",
    capabilities: ["chat", "json-mode", "tools"],
    contextWindow: 131072,
    costTier: "mid",
    notes: "PRIMARY model (confirmed on integrate.api.nvidia.com). Fast tool-capable fallback when Ultra is unreachable (384–606ms in 2026-09-03 pool tests).",
    emitsReasoning: false,
    toolCalling: true,
    preserveAssistantPayload: true
  },
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning": {
    id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
    label: "Nemotron 3 Nano Omni 30B (reasoning)",
    capabilities: ["chat", "json-mode", "tools"],
    contextWindow: 131072,
    costTier: "low",
    notes: "FAST reasoning model. Still receives native tools; XML <tool_call> is the fallback parser if the NIM does not emit tool_calls.",
    emitsReasoning: true,
    toolCalling: true,
    preserveAssistantPayload: true
  },
  "meta/llama-3.2-11b-vision-instruct": {
    id: "meta/llama-3.2-11b-vision-instruct",
    label: "Llama 3.2 11B Vision Instruct",
    capabilities: ["chat", "vision", "json-mode", "tools"],
    contextWindow: 131072,
    costTier: "low",
    notes: "Fast vision fallback (262–460ms). Tool calling via OpenAI tools array; XML fallback if the model plans in prose.",
    emitsReasoning: false,
    toolCalling: true,
    preserveAssistantPayload: false
  },
  "deepseek-ai/deepseek-v4-pro-0813": {
    id: "deepseek-ai/deepseek-v4-pro-0813",
    label: "DeepSeek V4 Pro (0813)",
    capabilities: ["chat", "json-mode", "tools"],
    contextWindow: 131072,
    costTier: "mid",
    notes: "SLOWER — 2–8s latency. Emits reasoning_content. Preserve the full assistant payload across turns.",
    emitsReasoning: true,
    toolCalling: true,
    preserveAssistantPayload: true
  },
  "deepseek-ai/deepseek-v4-flash-0731": {
    id: "deepseek-ai/deepseek-v4-flash-0731",
    label: "DeepSeek V4 Flash (0731) ⚠️",
    capabilities: ["chat", "json-mode", "tools"],
    contextWindow: 131072,
    costTier: "low",
    notes: "[⚠️ NVIDIA 503 service down historically] DeepSeek Flash deployment has been overloaded. Prefer Super / Ultra / Kimi.",
    emitsReasoning: true,
    toolCalling: true,
    preserveAssistantPayload: true
  },
  "meta/llama-3.2-90b-vision-instruct": {
    id: "meta/llama-3.2-90b-vision-instruct",
    label: "Llama 3.2 90B Vision Instruct",
    capabilities: ["chat", "vision", "json-mode", "tools"],
    contextWindow: 131072,
    costTier: "high",
    notes: "[key: may be unavailable] Larger Llama 3.2. Not accessible on some NVIDIA_API_KEY pools (timeout).",
    emitsReasoning: false,
    toolCalling: true,
    preserveAssistantPayload: false
  },
  "nvidia/llama-3.1-nemotron-ultra-253b-v1": {
    id: "nvidia/llama-3.1-nemotron-ultra-253b-v1",
    label: "Nemotron Ultra 253B v1",
    capabilities: ["chat", "json-mode", "tools"],
    contextWindow: 131072,
    costTier: "high",
    notes: "[key: may be unavailable] Older Ultra. Prefer nemotron-3-ultra-550b-a55b.",
    emitsReasoning: false,
    toolCalling: true,
    preserveAssistantPayload: true
  },
  "mistralai/mistral-large": {
    id: "mistralai/mistral-large",
    label: "Mistral Large",
    capabilities: ["chat", "json-mode", "tools"],
    contextWindow: 131072,
    costTier: "mid",
    notes: "[key: may be unavailable] Strong multilingual. HTTP 404 on some key pools.",
    emitsReasoning: false,
    toolCalling: true,
    preserveAssistantPayload: false
  },
  "ai21labs/jamba-1.5-large-instruct": {
    id: "ai21labs/jamba-1.5-large-instruct",
    label: "AI21 Jamba 1.5 Large",
    capabilities: ["chat", "json-mode"],
    contextWindow: 256000,
    costTier: "mid",
    notes: "[key: may be unavailable] Hybrid SSM-Transformer with 256K context.",
    emitsReasoning: false,
    toolCalling: false,
    preserveAssistantPayload: false
  },
  "disabled": {
    id: "disabled",
    label: "Disabled",
    capabilities: [],
    contextWindow: 0,
    costTier: "low",
    notes: "NVIDIA subsystems are turned off.",
    emitsReasoning: false,
    toolCalling: false,
    preserveAssistantPayload: false
  }
};

export const AGENT_CLAW_NVIDIA_MODEL: NvidiaModelId = "nvidia/nemotron-3-ultra-550b-a55b";
export const PRIMARY_CLAW_NVIDIA_MODEL: NvidiaModelId = "nvidia/nemotron-3-super-120b-a12b";
export const DEFAULT_CLAW_NVIDIA_MODEL: NvidiaModelId = AGENT_CLAW_NVIDIA_MODEL;
export const FALLBACK_CLAW_NVIDIA_MODEL: NvidiaModelId = PRIMARY_CLAW_NVIDIA_MODEL;
export const FALLBACK_CLAW_NVIDIA_MODELS: NvidiaModelId[] = [
  "moonshotai/kimi-k2.6",
  "nvidia/nemotron-3-super-120b-a12b",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning"
];

export const NVIDIA_BASE = "https://integrate.api.nvidia.com/v1";

export function isNvidiaModelId(v: unknown): v is NvidiaModelId {
  return typeof v === "string" && v in NVIDIA_MODELS;
}

export function listNvidiaModelIds(): NvidiaModelId[] {
  return Object.keys(NVIDIA_MODELS) as NvidiaModelId[];
}

export function getNvidiaModelMeta(id: NvidiaModelId) {
  return NVIDIA_MODELS[id];
}

export function isToolCallingModel(id: NvidiaModelId): boolean {
  return NVIDIA_MODELS[id]?.toolCalling === true;
}
