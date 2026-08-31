import fs from "node:fs";
import path from "node:path";
import { getProviderKey } from "@/lib/providers";

export type VeoStartInput = {
  prompt: string;
  model: string;
  aspectRatio: "9:16" | "16:9";
  resolution: "720p" | "1080p" | "4k";
  imageBase64?: string;
  imageMimeType?: string;
};

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

async function googleFetch(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "x-goog-api-key": getProviderKey("veo"),
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...(init?.headers || {})
    },
    cache: "no-store"
  });
  if (!response.ok) {
    const body = await response.text();
    let message = `Gemini API returned HTTP ${response.status}`;
    try { message = JSON.parse(body)?.error?.message || message; } catch {}
    throw new Error(message);
  }
  return response;
}

export async function startOneShot(input: VeoStartInput): Promise<string> {
  const instance: Record<string, unknown> = { prompt: input.prompt };
  if (input.imageBase64 && input.imageMimeType) {
    instance.image = { inlineData: { mimeType: input.imageMimeType, data: input.imageBase64 } };
  }

  // Veo 3.1 model parameter set:
  //   - aspectRatio, durationSeconds, resolution: supported
  //   - numberOfVideos: REMOVED in 3.1 (the legacy 2.x parameter;
  //     3.1 always returns exactly 1 sample per call)
  //   - personGeneration: kept on allow_adult; safe for a lawyer-
  //     marketing use case where the actor is the operator's own
  //     avatar. If a future 3.x revision drops this too, the
  //     Google API returns a 400 saying "personGeneration isn't
  //     supported" and the campaign-autopilot recovery walks past
  //     Veo to the next provider.
  //   - negativePrompt: added in 3.1, safe to send.
  const parameters: Record<string, unknown> = {
    aspectRatio: input.aspectRatio,
    durationSeconds: 8, // ONE CONTINUOUS SHOT ONLY
    resolution: input.resolution,
    personGeneration: "allow_adult"
  };

  const response = await googleFetch(`${BASE_URL}/models/${encodeURIComponent(input.model)}:predictLongRunning`, {
    method: "POST",
    body: JSON.stringify({
      instances: [instance],
      parameters
    })
  });
  const operation = await response.json() as { name?: string };
  if (!operation.name) throw new Error("Veo did not return an operation name");
  return operation.name;
}

export async function pollOneShot(operationName: string, jobId: string): Promise<{ done: false } | { done: true; outputPath: string }> {
  const response = await googleFetch(`${BASE_URL}/${operationName}`);
  const operation = await response.json() as any;
  if (!operation.done) return { done: false };
  if (operation.error) throw new Error(operation.error.message || "Veo generation failed");

  const videoUri = operation.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
  if (!videoUri) throw new Error("Veo completed without a downloadable video URI");

  const videoResponse = await googleFetch(videoUri);
  const bytes = Buffer.from(await videoResponse.arrayBuffer());
  const outDir = path.resolve(process.env.VIDEO_OUTPUT_DIR || "./data/videos");
  fs.mkdirSync(outDir, { recursive: true });
  const outputPath = path.join(outDir, `${jobId}.mp4`);
  fs.writeFileSync(outputPath, bytes);
  return { done: true, outputPath };
}
