// A2E AI video adapter (https://video.a2e.ai/dev).
// Single API key authorizes all their models (Veo 3.1, Wan, Kling, Seedance, Sora, ...).
// Per the docs:
//   Start: POST https://video.a2e.ai/api/v1/veoVideo/start
//          body { prompt, generationType, imageUrls?, model, aspectRatio, ... }
//          response { _id }  (their internal Mongo-style id)
//   Poll:  GET  https://video.a2e.ai/api/v1/veoVideo/{_id}
//          response { state?: "waiting"|"running"|"success"|"failed"|"fail", video_output?: string, ... }
//   Download: GET  https://video.a2e.ai/api/v1/veoVideo/{_id}/1080p  (final MP4 URL)
//
// The endpoint is named "veoVideo" but a2e serves multiple models through it.
// We keep the endpoint stable and only vary the `model` field.
//
// Honors ONE-CONTINUOUS-SHOT-ONLY: aspect is single-shot, model=veo3 is 8s.

import fs from "node:fs";
import path from "node:path";
import { getProviderKey, getProviderModel } from "@/lib/providers";

export type A2eStartInput = {
  prompt: string;
  aspectRatio: "9:16" | "16:9";
  resolution: "720p" | "1080p" | "4k";
  model?: string;
  imageBase64?: string;
  imageMimeType?: string;
};

const BASE = "https://video.a2e.ai/api/v1";

function authHeaders() {
  return {
    "Authorization": `Bearer ${getProviderKey("a2e")}`,
    "Content-Type": "application/json"
  };
}

function a2eResolution(r: "720p" | "1080p" | "4k"): "720p" | "1080p" {
  // A2E's veoVideo endpoint exposes /1080p or /720p paths; 4k is not available
  return r === "720p" ? "720p" : "1080p";
}

export async function startOneShot(input: A2eStartInput): Promise<string> {
  const model = input.model || getProviderModel("a2e");
  // Map our model id to a2e's expected enum. A2E's "veo3" is the Veo 3.1 model.
  const a2eModel = model === "veo3_fast" ? "veo3_fast" : "veo3";

  const body: Record<string, unknown> = {
    prompt: input.prompt,
    generationType: "TEXT_2_VIDEO",
    model: a2eModel,
    aspectRatio: input.aspectRatio
  };
  if (input.imageBase64 && input.imageMimeType) {
    // a2e accepts a public URL; if we have a base64, host it as a data URI through
    // a public proxy. For simplicity, send as a data URI which a2e supports
    // per their docs ("or base64-encoded data URI").
    body.imageUrls = [`data:${input.imageMimeType};base64,${input.imageBase64}`];
    body.generationType = "REFERENCE_2_VIDEO";
  }

  const res = await fetch(`${BASE}/veoVideo/start`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
    cache: "no-store"
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = `A2E start HTTP ${res.status}`;
    try { msg = JSON.parse(text)?.error?.message || msg; } catch {}
    throw new Error(msg);
  }
  const json = await res.json() as { _id?: string; data?: { _id?: string } };
  const id = json._id || json.data?._id;
  if (!id) throw new Error("A2E did not return a task _id");
  return id;
}

export type A2ePollResult = { done: false } | { done: true; outputPath: string };

export async function pollOneShot(taskId: string, jobId: string, resolution: "720p" | "1080p" | "4k" = "1080p"): Promise<A2ePollResult> {
  const res = await fetch(`${BASE}/veoVideo/${encodeURIComponent(taskId)}`, {
    method: "GET",
    headers: authHeaders(),
    cache: "no-store"
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = `A2E poll HTTP ${res.status}`;
    try { msg = JSON.parse(text)?.error?.message || msg; } catch {}
    throw new Error(msg);
  }
  const json = await res.json() as {
    state?: string;            // waiting | running | success | failed | fail
    video_output?: string;     // final MP4 url when state=success
    error?: string;
    fail_reason?: string;
  };

  if (json.state === "failed" || json.state === "fail") {
    throw new Error(json.fail_reason || json.error || `A2E generation ${json.state}`);
  }
  if (json.state !== "success") return { done: false };

  // Prefer the explicit video_output URL; fall back to the resolution-specific endpoint
  let videoUrl = json.video_output;
  if (!videoUrl) {
    const resSuffix = a2eResolution(resolution);
    videoUrl = `${BASE}/veoVideo/${encodeURIComponent(taskId)}/${resSuffix}`;
  }
  const videoRes = await fetch(videoUrl, {
    headers: authHeaders(),
    cache: "no-store"
  });
  if (!videoRes.ok) throw new Error(`Failed to download A2E video: HTTP ${videoRes.status}`);
  const bytes = Buffer.from(await videoRes.arrayBuffer());
  const outDir = path.resolve(process.env.VIDEO_OUTPUT_DIR || "./data/videos");
  fs.mkdirSync(outDir, { recursive: true });
  const outputPath = path.join(outDir, `${jobId}.mp4`);
  fs.writeFileSync(outputPath, bytes);
  return { done: true, outputPath };
}
