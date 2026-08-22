import { getNvidiaApiKey } from "./client";

export type NvidiaImageModel =
  | "black-forest-labs/flux.1-schnell"
  | "black-forest-labs/flux.2-klein-4b";

export const NVIDIA_IMAGE_MODELS: Array<{ id: NvidiaImageModel; label: string; notes: string }> = [
  { id: "black-forest-labs/flux.1-schnell", label: "FLUX.1 Schnell", notes: "Fast text-to-image drafts; ideal for article imagery and avatar concepts." },
  { id: "black-forest-labs/flux.2-klein-4b", label: "FLUX.2 Klein 4B", notes: "Generation plus reference-image editing for consistent avatar views." }
];

export function isNvidiaImageModel(v: unknown): v is NvidiaImageModel {
  return NVIDIA_IMAGE_MODELS.some(m => m.id === v);
}

function endpoint(model: NvidiaImageModel) {
  const slug = model === "black-forest-labs/flux.1-schnell" ? "flux.1-schnell" : "flux.2-klein-4b";
  return `https://ai.api.nvidia.com/v1/genai/black-forest-labs/${slug}`;
}

async function callNvidia(model: NvidiaImageModel, body: Record<string, unknown>) {
  const response = await fetch(endpoint(model), {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${getNvidiaApiKey()}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify(body),
    cache: "no-store"
  });
  if (!response.ok) {
    const text = (await response.text()).slice(0, 400);
    throw new Error(`NVIDIA image API HTTP ${response.status}: ${text}`);
  }
  const json = await response.json() as { artifacts?: Array<{ base64?: string; finishReason?: string }> };
  const base64 = json.artifacts?.[0]?.base64;
  if (!base64) throw new Error("NVIDIA image API returned no image artifact");
  return base64;
}

function imageSize(aspectRatio: string | undefined) {
  switch (aspectRatio) {
    case "16:9": return { width: 1344, height: 768 };
    case "4:3": return { width: 1152, height: 896 };
    case "3:2": return { width: 1216, height: 832 };
    case "1:1": default: return { width: 1024, height: 1024 };
  }
}

export async function generateImage(input: {
  prompt: string;
  model?: NvidiaImageModel;
  seed?: number;
  aspectRatio?: "16:9" | "4:3" | "3:2" | "1:1" | string;
}): Promise<{ base64: string; mimeType: "image/png"; model: NvidiaImageModel }> {
  const model = input.model || "black-forest-labs/flux.1-schnell";
  const prompt = input.prompt.trim().slice(0, 10000);
  if (!prompt) throw new Error("Image prompt is required");
  const { width, height } = imageSize(input.aspectRatio);
  const base64 = await callNvidia(model, {
    prompt,
    width,
    height,
    steps: 4,
    seed: Number.isFinite(input.seed) ? Math.max(0, Math.floor(input.seed!)) : 0
  });
  return { base64, mimeType: "image/png", model };
}

export async function generateAvatarImage(input: {
  prompt: string;
  model?: NvidiaImageModel;
  seed?: number;
}): Promise<{ base64: string; mimeType: "image/png"; model: NvidiaImageModel }> {
  return generateImage({ ...input, aspectRatio: "1:1" });
}

export async function editAvatarImage(input: {
  prompt: string;
  imageBase64: string;
  imageMimeType?: string;
  seed?: number;
}): Promise<{ base64: string; mimeType: "image/png"; model: "black-forest-labs/flux.2-klein-4b" }> {
  const model = "black-forest-labs/flux.2-klein-4b" as const;
  const prompt = input.prompt.trim().slice(0, 10000);
  if (!prompt) throw new Error("Avatar edit prompt is required");
  const mime = ["image/png", "image/jpeg", "image/webp"].includes(input.imageMimeType || "") ? input.imageMimeType! : "image/png";
  const image = `data:${mime};base64,${input.imageBase64}`;
  const base64 = await callNvidia(model, {
    prompt,
    image: [image],
    width: 1024,
    height: 1024,
    steps: 4,
    seed: Number.isFinite(input.seed) ? Math.max(0, Math.floor(input.seed!)) : 0
  });
  return { base64, mimeType: "image/png", model };
}
