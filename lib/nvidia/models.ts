// NVIDIA NIM model registry for Claw.
//
// All model IDs below are routed through NVIDIA NIM at
// https://integrate.api.nvidia.com/v1. Publisher prefixes such as
// moonshotai/, meta/, deepseek-ai/, mistralai/, and ai21labs/ describe the
// model publisher; they do not select a non-NVIDIA provider.

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
    notes: "AGENT default. Native tool calling + reasoning. When tools are sent, chat_template_kwargs.enable_thinking and force_nonempty_content must be set. Falls back to PRIMARY Super if Ultra is unavailable on the key pool.",
    emitsReasoning: true,
    toolCalling: true,
    preserveAssistantPayload: true
  },
  "moonshotai/kimi-k3": {
    id: "moonshotai/kimi-k3",
    label: "Kimi K3 (via NVIDIA NIM)",
    capabilities: ["chat", "vision", "json-mode", "tools"],
    contextWindow: 1048576,
    costTier: "high",
    notes: "NVIDIA-hosted multimodal agentic model. Preserve reasoning_content + tool_calls on follow-up turns.",
    emitsReasoning: true,
    toolCalling: true,
    preserveAssistantPayload: true
  },
  "moonshotai/kimi-k2.6": {
    id: "moonshotai/kimi-k2.6",
    label: "Kimi K2.6 (via NVIDIA NIM)",
    capabilities: ["chat", "json-mode", "tools"],
    contextWindow: 262144,
    costTier: "mid",
    notes: "NVIDIA-hosted agentic fallback. Preserve reasoning_content + tool_calls across turns; availability can vary by NVIDIA account.",
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
    notes: "PRIMARY NVIDIA model. Fast tool-capable fallback when Ultra is unreachable.",
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
    notes: "Fast reasoning model. Availability can vary by NVIDIA account; XML <tool_call> remains the fallback parser if native tool_calls are absent.",
    emitsReasoning: true,
    toolCalling: true,
    preserveAssistantPayload: true
  },
  "meta/llama-3.2-11b-vision-instruct": {
    id: "meta/llama-3.2-11b-vision-instruct",
    label: "Llama 3.2 11B Vision Instruct (via NVIDIA NIM)",
    capabilities: ["chat", "vision", "json-mode", "tools"],
    contextWindow: 131072,
    costTier: "low",
    notes: "Vision-capable NVIDIA NIM model. Tool calling via the OpenAI-compatible tools array; XML fallback if needed.",
    emitsReasoning: false,
    toolCalling: true,
    preserveAssistantPayload: false
  },
  "deepseek-ai/deepseek-v4-pro-0813": {
    id: "deepseek-ai/deepseek-v4-pro-0813",
    label: "DeepSeek V4 Pro (via NVIDIA NIM)",
    capabilities: ["chat", "json-mode", "tools"],
    contextWindow: 131072,
    costTier: "mid",
    notes: "NVIDIA-hosted model. Emits reasoning_content; preserve assistant payload across turns.",
    emitsReasoning: true,
    toolCalling: true,
    preserveAssistantPayload: true
  },
  "deepseek-ai/deepseek-v4-flash-0731": {
    id: "deepseek-ai/deepseek-v4-flash-0731",
    label: "DeepSeek V4 Flash (via NVIDIA NIM)",
    capabilities: ["chat", "json-mode", "tools"],
    contextWindow: 131072,
    costTier: "low",
    notes: "NVIDIA-hosted fast model; runtime availability can vary, so the provider retry/fallback path must remain enabled.",
    emitsReasoning: true,
    toolCalling: true,
    preserveAssistantPayload: true
  },
  "meta/llama-3.2-90b-vision-instruct": {
    id: "meta/llama-3.2-90b-vision-instruct",
    label: "Llama 3.2 90B Vision Instruct (via NVIDIA NIM)",
    capabilities: ["chat", "vision", "json-mode", "tools"],
    contextWindow: 131072,
    costTier: "high",
    notes: "Larger NVIDIA-hosted vision model; availability can vary by key pool.",
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
    notes: "Older Ultra model. Prefer Nemotron 3 Ultra 550B when available.",
    emitsReasoning: false,
    toolCalling: true,
    preserveAssistantPayload: true
  },
  "mistralai/mistral-large": {
    id: "mistralai/mistral-large",
    label: "Mistral Large (via NVIDIA NIM)",
    capabilities: ["chat", "json-mode", "tools"],
    contextWindow: 131072,
    costTier: "mid",
    notes: "NVIDIA-hosted multilingual model; availability can vary by key pool.",
    emitsReasoning: false,
    toolCalling: true,
    preserveAssistantPayload: false
  },
  "ai21labs/jamba-1.5-large-instruct": {
    id: "ai21labs/jamba-1.5-large-instruct",
    label: "AI21 Jamba 1.5 Large (via NVIDIA NIM)",
    capabilities: ["chat", "json-mode"],
    contextWindow: 256000,
    costTier: "mid",
    notes: "NVIDIA-hosted hybrid SSM-Transformer. No tool-calling capability is advertised here.",
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
  return typeof v === "string" && Object.hasOwn(NVIDIA_MODELS, v);
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
