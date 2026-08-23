// A2E multi-model media adapter using the public developer API contract.
// One A2E API token authorizes Veo, Wan, Kling, Seedance, Sora-style and
// related media routes. Reference media is uploaded to A2E R2 first because
// generation endpoints require public URLs rather than browser data URIs.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getProviderKey, getProviderModel } from "@/lib/providers";

export type A2eStartInput = {
  prompt: string;
  aspectRatio: "9:16" | "16:9";
  resolution: "720p" | "1080p" | "4k";
  model?: string;
  durationSeconds?: number;
  imageBase64?: string;
  imageMimeType?: string;
};

const BASE = "https://video.a2e.ai/api/v1";

type A2eFamily = "veo" | "wan" | "kling" | "seedance" | "sora";

type StoredOperation = { family: A2eFamily; id: string };

function authHeaders(json = true): Record<string, string> {
  return {
    Authorization: `Bearer ${getProviderKey("a2e")}`,
    ...(json ? { "Content-Type": "application/json" } : {})
  };
}

function familyForModel(model: string): A2eFamily {
  const normalized = model.toLowerCase();
  if (normalized.startsWith("wan")) return "wan";
  if (normalized.startsWith("kling")) return "kling";
  if (normalized.startsWith("seedance")) return "seedance";
  if (normalized.startsWith("sora")) return "sora";
  return "veo";
}

function encodeOperation(op: StoredOperation) { return `${op.family}:${op.id}`; }
function decodeOperation(raw: string): StoredOperation {
  const m = /^(veo|wan|kling|seedance|sora):(.+)$/.exec(raw);
  // Backward compatibility for jobs created by the old Veo-only A2E adapter.
  return m ? { family: m[1] as A2eFamily, id: m[2] } : { family: "veo", id: raw };
}

function endpointForFamily(family: A2eFamily) {
  if (family === "wan") return "userWan25";
  if (family === "kling") return "klingVideo";
  if (family === "seedance") return "seedance2Video";
  if (family === "sora") return "soraVideo";
  return "veoVideo";
}

function extensionForMime(mime: string) {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
  throw new Error(`A2E reference image must be PNG, JPEG, or WebP; received ${mime || "unknown MIME type"}`);
}

async function uploadReferenceImage(base64: string, mime: string): Promise<string> {
  const bytes = Buffer.from(base64, "base64");
  if (!bytes.length) throw new Error("A2E reference image is empty");
  const ext = extensionForMime(mime);
  const key = `video-engine/${crypto.randomUUID()}.${ext}`;
  const presign = await fetch(`${BASE}/r2/upload-presigned-url`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ key, contentType: mime, contentLength: bytes.length, expiresIn: 900 }),
    cache: "no-store"
  });
  if (!presign.ok) throw new Error(`A2E upload URL HTTP ${presign.status}: ${(await presign.text()).slice(0,300)}`);
  const payload = await presign.json() as { data?: { uploadUrl?: string; cdnUrl?: string } };
  const uploadUrl = payload.data?.uploadUrl;
  const cdnUrl = payload.data?.cdnUrl;
  if (!uploadUrl || !cdnUrl) throw new Error("A2E upload endpoint did not return uploadUrl and cdnUrl");
  const put = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": mime, "Content-Length": String(bytes.length) }, body: bytes });
  if (!put.ok) throw new Error(`A2E reference upload HTTP ${put.status}: ${(await put.text()).slice(0,200)}`);
  return cdnUrl;
}

function clampDuration(value: number | undefined, min: number, max: number, fallback: number) {
  const n = Number(value || fallback);
  return Math.max(min, Math.min(max, Math.round(n)));
}

function nearest(value: number, allowed: number[]) {
  return allowed.reduce((best, candidate) => Math.abs(candidate - value) < Math.abs(best - value) ? candidate : best, allowed[0]);
}

function extractId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  for (const key of ["_id", "id", "task_id", "taskId", "video_id"]) {
    if (typeof obj[key] === "string" && obj[key]) return String(obj[key]);
  }
  for (const key of ["data", "record", "task", "result"]) {
    const nested = extractId(obj[key]); if (nested) return nested;
  }
  return null;
}

function findString(value: unknown, keys: string[]): string | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  for (const key of keys) if (typeof obj[key] === "string" && obj[key]) return String(obj[key]);
  for (const nested of Object.values(obj)) {
    if (nested && typeof nested === "object") { const found = findString(nested, keys); if (found) return found; }
  }
  return null;
}

function normalizedState(value: unknown) {
  const state = (findString(value, ["state", "status", "current_status", "task_status"]) || "").toLowerCase();
  if (["success", "succeeded", "completed", "complete", "done", "finished"].includes(state)) return "success";
  if (["failed", "fail", "error", "cancelled", "canceled"].includes(state)) return "failed";
  return "pending";
}

function outputUrl(value: unknown) {
  return findString(value, ["video_output", "video_url", "result_video_url", "output_url", "result_url", "download_url", "url"]);
}

export async function startOneShot(input: A2eStartInput): Promise<string> {
  const model = input.model || getProviderModel("a2e");
  const family = familyForModel(model);
  const imageUrl = input.imageBase64 && input.imageMimeType ? await uploadReferenceImage(input.imageBase64, input.imageMimeType) : null;
  let body: Record<string, unknown>;

  if (family === "wan") {
    const duration = clampDuration(input.durationSeconds, 2, 15, 8);
    body = {
      prompt: input.prompt,
      model: "wan2.7-i2v",
      task_type: imageUrl ? "first_frame" : "text_to_video",
      ...(imageUrl ? { image_url: imageUrl } : {}),
      duration: String(duration),
      resolution: input.resolution === "4k" ? "1080p" : input.resolution,
      ratio: input.aspectRatio,
      audio: true,
      enable_prompt_expansion: true,
      multi_shots: false
    };
  } else if (family === "kling") {
    const duration = clampDuration(input.durationSeconds, 3, 15, 8);
    body = {
      mode: imageUrl ? "image-to-video" : "text-to-video",
      prompt: input.prompt,
      version: "3.0",
      model_version: model.includes("fast") ? "fast" : "standard",
      quality_mode: input.resolution === "4k" ? "4k" : input.resolution === "1080p" ? "pro" : "std",
      resolution: input.resolution === "720p" ? "720p" : "1080p",
      duration: String(duration),
      aspect_ratio: input.aspectRatio,
      sound: true,
      ...(imageUrl ? { image_url: imageUrl } : {})
    };
  } else if (family === "seedance") {
    const duration = clampDuration(input.durationSeconds, 2, 30, 8);
    body = {
      mode: imageUrl ? "image-to-video" : "text-to-video",
      model_version: "2.5",
      prompt: input.prompt,
      duration,
      aspect_ratio: input.aspectRatio,
      resolution: input.resolution,
      generate_audio: true,
      ...(imageUrl ? { image_url: imageUrl } : {})
    };
  } else if (family === "sora") {
    const duration = nearest(clampDuration(input.durationSeconds, 5, 15, 8), [5, 10, 15]);
    body = {
      model_type: imageUrl ? "image-to-video" : "text-to-video",
      prompt: input.prompt,
      ...(imageUrl ? { image_urls: [imageUrl] } : {}),
      aspect_ratio: input.aspectRatio === "9:16" ? "portrait" : "landscape",
      duration_seconds: String(duration),
      quality: input.resolution === "720p" ? "standard" : "high"
    };
  } else {
    body = {
      prompt: input.prompt,
      generationType: imageUrl ? "REFERENCE_2_VIDEO" : "TEXT_2_VIDEO",
      ...(imageUrl ? { imageUrls: [imageUrl] } : {}),
      model: model === "veo3" ? "veo3" : "veo3_fast",
      aspectRatio: input.aspectRatio
    };
  }

  const endpoint = endpointForFamily(family);
  const res = await fetch(`${BASE}/${endpoint}/start`, { method: "POST", headers: authHeaders(), body: JSON.stringify(body), cache: "no-store" });
  if (!res.ok) throw new Error(`A2E ${family} start HTTP ${res.status}: ${(await res.text()).slice(0,400)}`);
  const json = await res.json();
  const id = extractId(json);
  if (!id) throw new Error(`A2E ${family} did not return a task id`);
  return encodeOperation({ family, id });
}

export type A2ePollResult = { done: false } | { done: true; outputPath: string };

export async function pollOneShot(rawOperation: string, jobId: string, resolution: "720p" | "1080p" | "4k" = "1080p"): Promise<A2ePollResult> {
  const op = decodeOperation(rawOperation);
  const endpoint = endpointForFamily(op.family);
  const res = await fetch(`${BASE}/${endpoint}/${encodeURIComponent(op.id)}`, { method: "GET", headers: authHeaders(), cache: "no-store" });
  if (!res.ok) throw new Error(`A2E ${op.family} poll HTTP ${res.status}: ${(await res.text()).slice(0,300)}`);
  const json = await res.json();
  const state = normalizedState(json);
  if (state === "failed") {
    const reason = findString(json, ["failed_message", "fail_reason", "error_message", "error", "message"]);
    throw new Error(reason || `A2E ${op.family} generation failed`);
  }
  if (state !== "success") return { done: false };

  let videoUrl = outputUrl(json);
  if (!videoUrl && op.family === "veo") {
    const suffix = resolution === "720p" ? "720p" : "1080p";
    videoUrl = `${BASE}/veoVideo/${encodeURIComponent(op.id)}/${suffix}`;
  }
  if (!videoUrl) throw new Error(`A2E ${op.family} completed without a video URL`);

  let videoRes = await fetch(videoUrl, { headers: authHeaders(false), cache: "no-store" });
  if (!videoRes.ok) videoRes = await fetch(videoUrl, { cache: "no-store" });
  if (!videoRes.ok) throw new Error(`Failed to download A2E ${op.family} video: HTTP ${videoRes.status}`);
  const bytes = Buffer.from(await videoRes.arrayBuffer());
  const outDir = path.resolve(process.env.VIDEO_OUTPUT_DIR || "./data/videos");
  fs.mkdirSync(outDir, { recursive: true });
  const outputPath = path.join(outDir, `${jobId}.mp4`);
  fs.writeFileSync(outputPath, bytes);
  return { done: true, outputPath };
}
