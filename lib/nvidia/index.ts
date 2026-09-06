// lib/nvidia/index.ts — Claw-only re-exports.
export {
  getNvidiaApiKey,
  getNvidiaModel,
  getClawModel,
  isNvidiaEnabled,
  hasNvidiaApiKeys,
  chatCompletion,
  chatCompletionStream,
  type ChatMessage,
  type ChatRequest,
  type ChatResponse,
  type OpenAITool,
  type NativeToolCall
} from "./client";
export type { NvidiaModelId } from "./models";
export { NVIDIA_MODELS, DEFAULT_CLAW_NVIDIA_MODEL, DEFAULT_VISION_NVIDIA_MODEL, isNvidiaModelId, listAgenticNvidiaModelIds } from "./models";
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
