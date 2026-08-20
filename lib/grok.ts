// xAI Grok Imagine video adapter.
// API contract (https://docs.x.ai/developers/model-capabilities/video/generation):
//   Start: POST https://api.x.ai/v1/videos/generations
//          body { model, prompt, image?: {url|dataUri}, duration?, aspect_ratio?, resolution? }
//          response { request_id }
//   Poll:  GET  https://api.x.ai/v1/videos/{request_id}
//          response { status, video?: { url }, ... }   (status: pending | done | failed | expired)
//   The video.url is a temporary CDN URL — download it promptly.
//
// Honors the project's ONE-CONTINUOUS-SHOT-ONLY contract: always duration=8.

import fs from "node:fs";
import path from "node:path";
import { getProviderKey, getProviderModel } from "@/lib/providers";

export type GrokStartInput = {
  prompt: string;
  aspectRatio: "9:16" | "16:9";
  resolution: "720p" | "1080p" | "4k";
  model?: string;
  imageUrl?: string;     // public URL for the starting frame
  imageBase64?: string;  // OR base64 inline
  imageMimeType?: string;
};

const BASE = "https://api.x.ai/v1";

function authHeaders() {
  return {
    "Authorization": `Bearer ${getProviderKey("grok")}`,
    "Content-Type": "application/json"
  };
}

function grokAspect(ar: "9:16" | "16:9"): string {
  // Grok accepts the same string directly
  return ar;
}

function grokResolution(r: "720p" | "1080p" | "4k"): string {
  // Grok supports 480p / 720p / 1080p depending on the model. Map unsupported 4k -> 1080p.
  return r === "4k" ? "1080p" : r;
}

export async function startOneShot(input: GrokStartInput): Promise<string> {
  const model = input.model || getProviderModel("grok");
  const body: Record<string, unknown> = {
    model,
    prompt: input.prompt,
    duration: 8, // ONE CONTINUOUS SHOT ONLY — locked at 8s
    aspect_ratio: grokAspect(input.aspectRatio),
    resolution: grokResolution(input.resolution)
  };
  if (input.imageBase64 && input.imageMimeType) {
    body.image = {
      url: `data:${input.imageMimeType};base64,${input.imageBase64}`
    };
  } else if (input.imageUrl) {
    body.image = { url: input.imageUrl };
  }

  const res = await fetch(`${BASE}/videos/generations`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
    cache: "no-store"
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = `xAI Grok start HTTP ${res.status}`;
    try { msg = JSON.parse(text)?.error?.message || msg; } catch {}
    throw new Error(msg);
  }
  const json = await res.json() as { request_id?: string };
  if (!json.request_id) throw new Error("xAI Grok did not return a request_id");
  return json.request_id;
}

export type GrokPollResult = { done: false } | { done: true; outputPath: string };

export async function pollOneShot(requestId: string, jobId: string): Promise<GrokPollResult> {
  const res = await fetch(`${BASE}/videos/${encodeURIComponent(requestId)}`, {
    method: "GET",
    headers: authHeaders(),
    cache: "no-store"
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = `xAI Grok poll HTTP ${res.status}`;
    try { msg = JSON.parse(text)?.error?.message || msg; } catch {}
    throw new Error(msg);
  }
  const json = await res.json() as {
    status?: string;          // pending | done | failed | expired
    video?: { url?: string };
    error?: { message?: string };
  };

  if (json.status === "failed" || json.status === "expired") {
    throw new Error(json.error?.message || `Grok generation ${json.status}`);
  }
  if (json.status !== "done") return { done: false };

  const videoUrl = json.video?.url;
  if (!videoUrl) throw new Error("Grok reported done but returned no video URL");

  // Download the MP4 to the same output path other providers use
  const videoRes = await fetch(videoUrl, { cache: "no-store" });
  if (!videoRes.ok) throw new Error(`Failed to download Grok video: HTTP ${videoRes.status}`);
  const bytes = Buffer.from(await videoRes.arrayBuffer());
  const outDir = path.resolve(process.env.VIDEO_OUTPUT_DIR || "./data/videos");
  fs.mkdirSync(outDir, { recursive: true });
  const outputPath = path.join(outDir, `${jobId}.mp4`);
  fs.writeFileSync(outputPath, bytes);
  return { done: true, outputPath };
}
