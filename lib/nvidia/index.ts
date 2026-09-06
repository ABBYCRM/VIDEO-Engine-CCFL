// lib/nvidia/index.ts — Claw-only re-exports.
export {
  getNvidiaApiKey,
  getNvidiaModel,
  getClawModel,
  isNvidiaEnabled,
  chatCompletion,
  chatCompletionStream,
  type ChatMessage,
  type ChatRequest,
  type ChatResponse
} from "./client";
export type { NvidiaModelId } from "./models";
export { NVIDIA_MODELS, AGENT_CLAW_NVIDIA_MODEL, PRIMARY_CLAW_NVIDIA_MODEL, DEFAULT_CLAW_NVIDIA_MODEL, FALLBACK_CLAW_NVIDIA_MODEL, FALLBACK_CLAW_NVIDIA_MODELS, isNvidiaModelId, isToolCallingModel } from "./models";
export { analyzeImage } from "./vision";
export {
  rerankPassages,
  isRerankConfigured,
  getClawRerankModel,
  RERANK_MODELS,
  DEFAULT_CLAW_RERANK_MODEL,
  isRerankModelId,
  type RerankModelId,
  type RerankResult
} from "./rerank";
