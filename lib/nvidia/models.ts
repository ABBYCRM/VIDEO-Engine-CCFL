// NVIDIA NIM model registry for Claw (OpenAI-compatible chat + tools).
//
// Endpoint: POST https://integrate.api.nvidia.com/v1/chat/completions
//
// Tool calling is a per-model capability. Claw always sends an OpenAI `tools`
// array + `tool_choice: "auto"` so agentic models can emit native tool_calls.
// XML <tool_call> in the prompt remains a fallback for models that ignore tools.
//
// Catalog cross-check 2026-09-06 (docs.api.nvidia.com/nim/reference/llm-apis):
//   moonshotai/kimi-k2-instruct, moonshotai/kimi-k2-thinking, moonshotai/kimi-k3
//   nvidia/nemotron-3-super-120b-a12b, nvidia/nemotron-3-nano-30b-a3b
//   nvidia/nemotron-3.5-lightning-30b-a3b, nvidia/nemotron-3-ultra-550b-a55b
//   meta/llama-3.2-11b-vision-instruct (tool-capable Llama 3.2 family)
// kimi-k2.5 / kimi-k2.6 have dedicated infer pages; they may 404 on a given key.
//
// SPEED TEST 2026-09-03 (3 trials each, "Say PONG") on the operator key pool:
//   ✅ meta/llama-3.2-11b-vision-instruct     262–460ms
//   ✅ nvidia/nemotron-3-super-120b-a12b       384–606ms
//   ✅ nvidia/nemotron-3-nano-omni-30b-a3b    421–1346ms
//   ⚠️  deepseek-ai/deepseek-v4-pro-0813        2154–7930ms
//   ⛔  nvidia/nemotron-3-ultra-550b-a55b     18–20s — too slow for interactive chat
//
// Default is Nemotron 3 Super: confirmed on the operator pool, Nemotron-3
// agentic family, and documented as tool-calling capable.

export type NvidiaCapability = "chat" | "vision" | "json-mode" | "tools";

export type NvidiaModelId =
  | "nvidia/nemotron-3-super-120b-a12b"
  | "nvidia/nemotron-3-nano-30b-a3b"
  | "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning"
  | "nvidia/nemotron-3.5-lightning-30b-a3b"
  | "nvidia/nemotron-3-ultra-550b-a55b"
  | "moonshotai/kimi-k2-instruct"
  | "moonshotai/kimi-k2-thinking"
  | "moonshotai/kimi-k2.5"
  | "moonshotai/kimi-k2.6"
  | "moonshotai/kimi-k3"
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
  // Some models emit a `reasoning_content` delta field that the operator-facing
  // stream should strip. The registry is the single source of truth.
  emitsReasoning: boolean;
  toolCalling: boolean;
}> = {
  "nvidia/nemotron-3-super-120b-a12b": {
    id: "nvidia/nemotron-3-super-120b-a12b",
    label: "Nemotron 3 Super 120B ★ default",
    capabilities: ["chat", "json-mode", "tools"],
    contextWindow: 131072,
    costTier: "mid",
    notes: "DEFAULT — agentic Nemotron-3. Confirmed on the operator pool at 384–606ms. Native tool calling.",
    emitsReasoning: false,
    toolCalling: true
  },
  "nvidia/nemotron-3-nano-30b-a3b": {
    id: "nvidia/nemotron-3-nano-30b-a3b",
    label: "Nemotron 3 Nano 30B",
    capabilities: ["chat", "json-mode", "tools"],
    contextWindow: 131072,
    costTier: "low",
    notes: "Catalog Nemotron-3 Nano (tool calling enabled in NIM). Faster/cheaper agentic variant.",
    emitsReasoning: false,
    toolCalling: true
  },
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning": {
    id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
    label: "Nemotron 3 Nano Omni 30B (reasoning)",
    capabilities: ["chat", "json-mode", "tools"],
    contextWindow: 131072,
    costTier: "low",
    notes: "FAST at 421–1346ms. Reasoning model — Claw sends thinking=false so it can emit tools instead of looping.",
    emitsReasoning: true,
    toolCalling: true
  },
  "nvidia/nemotron-3.5-lightning-30b-a3b": {
    id: "nvidia/nemotron-3.5-lightning-30b-a3b",
    label: "Nemotron 3.5 Lightning 30B",
    capabilities: ["chat", "json-mode", "tools"],
    contextWindow: 131072,
    costTier: "low",
    notes: "Previous Claw default (AGENTS.md). Still listed on the NIM catalog; some keys 404 after the 2026-08-27 rotation.",
    emitsReasoning: false,
    toolCalling: true
  },
  "nvidia/nemotron-3-ultra-550b-a55b": {
    id: "nvidia/nemotron-3-ultra-550b-a55b",
    label: "Nemotron 3 Ultra 550B",
    capabilities: ["chat", "json-mode", "tools"],
    contextWindow: 131072,
    costTier: "high",
    notes: "Strongest Nemotron-3 agent. 18–20s on the 2026-09-03 pool — use for hard tool plans, not snappy chat.",
    emitsReasoning: true,
    toolCalling: true
  },
  "moonshotai/kimi-k2-instruct": {
    id: "moonshotai/kimi-k2-instruct",
    label: "Kimi K2 Instruct",
    capabilities: ["chat", "json-mode", "tools"],
    contextWindow: 262144,
    costTier: "mid",
    notes: "Moonshot agentic instruct (NIM catalog). Strong native tool_calls. Availability is key-dependent.",
    emitsReasoning: false,
    toolCalling: true
  },
  "moonshotai/kimi-k2-thinking": {
    id: "moonshotai/kimi-k2-thinking",
    label: "Kimi K2 Thinking",
    capabilities: ["chat", "json-mode", "tools"],
    contextWindow: 262144,
    costTier: "mid",
    notes: "Thinking variant — preserve reasoning_content across tool turns. Claw stores it and strips it from the token stream.",
    emitsReasoning: true,
    toolCalling: true
  },
  "moonshotai/kimi-k2.5": {
    id: "moonshotai/kimi-k2.5",
    label: "Kimi K2.5",
    capabilities: ["chat", "vision", "json-mode", "tools"],
    contextWindow: 262144,
    costTier: "mid",
    notes: "Listed on a dedicated NIM infer page. May 404 on keys that only have kimi-k2-instruct / kimi-k3.",
    emitsReasoning: false,
    toolCalling: true
  },
  "moonshotai/kimi-k2.6": {
    id: "moonshotai/kimi-k2.6",
    label: "Kimi K2.6",
    capabilities: ["chat", "vision", "json-mode", "tools"],
    contextWindow: 262144,
    costTier: "mid",
    notes: "Community-confirmed NIM id. Preserve reasoning_content if the model emits it.",
    emitsReasoning: true,
    toolCalling: true
  },
  "moonshotai/kimi-k3": {
    id: "moonshotai/kimi-k3",
    label: "Kimi K3",
    capabilities: ["chat", "json-mode", "tools"],
    contextWindow: 262144,
    costTier: "high",
    notes: "Newest Moonshot on the NIM catalog. Must keep reasoning_content on follow-up turns. Temperature ~1.0 recommended by Moonshot.",
    emitsReasoning: true,
    toolCalling: true
  },
  "meta/llama-3.2-11b-vision-instruct": {
    id: "meta/llama-3.2-11b-vision-instruct",
    label: "Llama 3.2 11B Vision Instruct",
    capabilities: ["chat", "vision", "json-mode", "tools"],
    contextWindow: 131072,
    costTier: "low",
    notes: "FASTEST confirmed model (262–460ms). Llama 3.2 family supports NIM tool calling. Vision fallback for analyze_image.",
    emitsReasoning: false,
    toolCalling: true
  },
  "deepseek-ai/deepseek-v4-pro-0813": {
    id: "deepseek-ai/deepseek-v4-pro-0813",
    label: "DeepSeek V4 Pro (0813)",
    capabilities: ["chat", "json-mode", "tools"],
    contextWindow: 131072,
    costTier: "mid",
    notes: "SLOWER — 2–8s latency. Emits reasoning_content. Claw preserves it across tool turns.",
    emitsReasoning: true,
    toolCalling: true
  },
  "deepseek-ai/deepseek-v4-flash-0731": {
    id: "deepseek-ai/deepseek-v4-flash-0731",
    label: "DeepSeek V4 Flash (0731) ⚠️",
    capabilities: ["chat", "json-mode", "tools"],
    contextWindow: 131072,
    costTier: "low",
    notes: "[⚠️ NVIDIA 503] DeepSeek Flash was overloaded across the 2026-09-03 key pool. Prefer Pro or Nemotron.",
    emitsReasoning: true,
    toolCalling: true
  },
  "meta/llama-3.2-90b-vision-instruct": {
    id: "meta/llama-3.2-90b-vision-instruct",
    label: "Llama 3.2 90B Vision Instruct",
    capabilities: ["chat", "vision", "json-mode", "tools"],
    contextWindow: 131072,
    costTier: "high",
    notes: "[key: unavailable] Larger Llama 3.2. Not accessible with the 2026-09-03 key pool.",
    emitsReasoning: false,
    toolCalling: true
  },
  "nvidia/llama-3.1-nemotron-ultra-253b-v1": {
    id: "nvidia/llama-3.1-nemotron-ultra-253b-v1",
    label: "Nemotron Ultra 253B v1",
    capabilities: ["chat", "json-mode", "tools"],
    contextWindow: 131072,
    costTier: "high",
    notes: "[key: unavailable] Llama Nemotron Ultra. HTTP 404 on the 2026-09-03 key pool.",
    emitsReasoning: false,
    toolCalling: true
  },
  "mistralai/mistral-large": {
    id: "mistralai/mistral-large",
    label: "Mistral Large",
    capabilities: ["chat", "json-mode", "tools"],
    contextWindow: 131072,
    costTier: "mid",
    notes: "[key: unavailable] Mistral family supports NIM tool calling. HTTP 404 on the 2026-09-03 key pool.",
    emitsReasoning: false,
    toolCalling: true
  },
  "ai21labs/jamba-1.5-large-instruct": {
    id: "ai21labs/jamba-1.5-large-instruct",
    label: "AI21 Jamba 1.5 Large",
    capabilities: ["chat"],
    contextWindow: 256000,
    costTier: "mid",
    notes: "[key: unavailable] Hybrid SSM-Transformer. Tool support not documented for this NIM.",
    emitsReasoning: false,
    toolCalling: false
  },
  "disabled": {
    id: "disabled",
    label: "Disabled",
    capabilities: [],
    contextWindow: 0,
    costTier: "low",
    notes: "NVIDIA subsystems are turned off.",
    emitsReasoning: false,
    toolCalling: false
  }
};

export const DEFAULT_CLAW_NVIDIA_MODEL: NvidiaModelId = "nvidia/nemotron-3-super-120b-a12b";
export const DEFAULT_VISION_NVIDIA_MODEL: NvidiaModelId = "meta/llama-3.2-11b-vision-instruct";

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

export function listAgenticNvidiaModelIds(): NvidiaModelId[] {
  return listNvidiaModelIds().filter((id) => id !== "disabled" && NVIDIA_MODELS[id].toolCalling);
}
