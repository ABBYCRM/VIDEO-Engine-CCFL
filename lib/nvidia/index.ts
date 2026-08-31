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
export { NVIDIA_MODELS, DEFAULT_CLAW_NVIDIA_MODEL, isNvidiaModelId } from "./models";
export { analyzeImage } from "./vision";
