import { getNvidiaApiKey } from "./client";

export type NvidiaImageModel =
  | "black-forest-labs/flux.1-schnell"
  | "black-forest-labs/flux.2-klein-4b";

export const NVIDIA_IMAGE_MODELS: Array<{ id: NvidiaImageModel; label: string; notes: string }> = [
  { id: "black-forest-labs/flux.1-schnell", label: "FLUX.1 Schnell", notes: "Fast avatar drafts; 1–4 steps." },
  { id: "black-forest-labs/flux.2-klein-4b", label: "FLUX.2 Klein 4B", notes: "Higher-quality fast generation; use when Schnell misses the brief." }
];

export function isNvidiaImageModel(v: unknown): v is NvidiaImageModel {
  return NVIDIA_IMAGE_MODELS.some(m => m.id === v);
}

function endpoint(model: NvidiaImageModel) {
  const slug = model === "black-forest-labs/flux.1-schnell" ? "flux.1-schnell" : "flux.2-klein-4b";
  return `https://ai.api.nvidia.com/v1/genai/black-forest-labs/${slug}`;
}

export async function generateAvatarImage(input: {
  prompt: string;
  model?: NvidiaImageModel;
  seed?: number;
}): Promise<{ base64: string; mimeType: "image/png"; model: NvidiaImageModel }> {
  const model = input.model || "black-forest-labs/flux.1-schnell";
  const prompt = input.prompt.trim().slice(0, 10000);
  if (!prompt) throw new Error("Avatar prompt is required");
  const response = await fetch(endpoint(model), {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${getNvidiaApiKey()}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify({
      prompt,
      width: 1024,
      height: 1024,
      seed: Number.isFinite(input.seed) ? Math.max(0, Math.floor(input.seed!)) : 0,
      ...(model === "black-forest-labs/flux.1-schnell" ? { steps: 4 } : { steps: 4, mode: "Image Generation" })
    }),
    cache: "no-store"
  });
  if (!response.ok) {
    const text = (await response.text()).slice(0, 400);
    throw new Error(`NVIDIA image API HTTP ${response.status}: ${text}`);
  }
  const json = await response.json() as { artifacts?: Array<{ base64?: string; finishReason?: string }> };
  const base64 = json.artifacts?.[0]?.base64;
  if (!base64) throw new Error("NVIDIA image API returned no image artifact");
  return { base64, mimeType: "image/png", model };
}
