// Real image understanding for Claw, built on top of the vision-capable
// NVIDIA NIM models already in the registry (lib/nvidia/models.ts marks
// meta/llama-3.2-11b-vision-instruct and the 90b variant with the
// "vision" capability — that metadata existed before this file but was
// never actually consumed anywhere; lib/nvidia/client.ts's ChatMessage
// was text-only). This is the missing piece: a real multimodal request.
//
// Request shape verified against NVIDIA's own documented examples for
// this exact hosted endpoint (integrate.api.nvidia.com/v1/chat/completions,
// the same NVIDIA_BASE this app already uses), 2026-08-30:
//   content: [{type:"image_url", image_url:{url}}, {type:"text", text}]
// A plain public HTTPS image URL works directly — no need to download and
// base64-encode it (which would also risk NVIDIA's ~180KB inline-payload
// cap on the hosted API). Supported formats per NVIDIA's docs: JPG/JPEG/PNG.

import { chatCompletion, type ChatContentPart } from "./client";
import { getClawModel } from "./client";
import { NVIDIA_MODELS, DEFAULT_CLAW_NVIDIA_MODEL, type NvidiaModelId } from "./models";

function pickVisionModel(): NvidiaModelId {
  const current = getClawModel();
  if (NVIDIA_MODELS[current]?.capabilities.includes("vision")) return current;
  // The operator's configured Claw model doesn't support vision (e.g. a
  // text-only Nemotron/DeepSeek/Mistral variant) — fall back to the known
  // vision-capable default rather than sending an image to a model that
  // will just ignore or error on it.
  return DEFAULT_CLAW_NVIDIA_MODEL;
}

export async function analyzeImage(input: { imageUrl: string; question: string }): Promise<string> {
  const content: ChatContentPart[] = [
    { type: "image_url", image_url: { url: input.imageUrl } },
    { type: "text", text: input.question }
  ];
  const result = await chatCompletion({
    model: pickVisionModel(),
    messages: [{ role: "user", content }],
    temperature: 0.2,
    maxTokens: 400
  });
  return result.text.trim();
}
