// Bitdeer AI inference model registry for Claw.
//
// OpenAI-compatible:
//   POST https://api-inference.bitdeer.ai/v1/chat/completions
//   POST https://api-inference.bitdeer.ai/v1/images/generations
//   POST https://api-inference.bitdeer.ai/v1/rerank
//   POST https://api-inference.bitdeer.ai/v1/embeddings
//
// Replaces nvidia.com NIM. Auth is BITDEER_API_KEY (NVIDIA_API_KEY is an alias).

export type NvidiaCapability = "chat" | "vision" | "json-mode" | "tools";

export type NvidiaModelId =
  | "mistralai/Mistral-Large-3-675B-Instruct-2512"
  | "zai-org/GLM-5"
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
  "mistralai/Mistral-Large-3-675B-Instruct-2512": {
    id: "mistralai/Mistral-Large-3-675B-Instruct-2512",
    label: "Mistral Large 3 675B \u2605 agent default",
    capabilities: ["chat", "json-mode", "tools"],
    contextWindow: 262144,
    costTier: "high",
    notes: "AGENT default on Bitdeer. Native tool calling. Clean content (not a reasoning-first model).",
    emitsReasoning: false,
    toolCalling: true,
    preserveAssistantPayload: true
  },
  "zai-org/GLM-5": {
    id: "zai-org/GLM-5",
    label: "GLM-5 \u2605 primary / fallback",
    capabilities: ["chat", "json-mode", "tools"],
    contextWindow: 1048576,
    costTier: "mid",
    notes: "PRIMARY / fallback on Bitdeer. Reasoning model \u2014 may emit reasoning before content. Raise max_tokens if content is empty.",
    emitsReasoning: true,
    toolCalling: true,
    preserveAssistantPayload: true
  },
  "disabled": {
    id: "disabled",
    label: "Disabled",
    capabilities: [],
    contextWindow: 0,
    costTier: "low",
    notes: "LLM subsystems are turned off.",
    emitsReasoning: false,
    toolCalling: false,
    preserveAssistantPayload: false
  }
};

export const AGENT_CLAW_NVIDIA_MODEL: NvidiaModelId = "mistralai/Mistral-Large-3-675B-Instruct-2512";
export const PRIMARY_CLAW_NVIDIA_MODEL: NvidiaModelId = "zai-org/GLM-5";
export const DEFAULT_CLAW_NVIDIA_MODEL: NvidiaModelId = AGENT_CLAW_NVIDIA_MODEL;
export const FALLBACK_CLAW_NVIDIA_MODEL: NvidiaModelId = PRIMARY_CLAW_NVIDIA_MODEL;
export const FALLBACK_CLAW_NVIDIA_MODELS: NvidiaModelId[] = [
  "zai-org/GLM-5",
  "mistralai/Mistral-Large-3-675B-Instruct-2512"
];

export const BITDEER_IMAGE_MODEL = "black-forest-labs/FLUX-2-pro";

function resolveBitdeerBase(): string {
  const raw = process.env.BITDEER_BASE_URL || process.env.NVIDIA_BASE_URL || "https://api-inference.bitdeer.ai/v1";
  return raw.replace(/\/$/, "");
}

export const BITDEER_BASE = resolveBitdeerBase();
export const NVIDIA_BASE = BITDEER_BASE;

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
