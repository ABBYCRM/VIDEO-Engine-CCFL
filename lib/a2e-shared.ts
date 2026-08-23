import crypto from "node:crypto";
import { getProviderKey } from "@/lib/providers";

export const A2E_BASE = "https://video.a2e.ai/api/v1";

export function a2eHeaders(json = true): Record<string, string> {
  return {
    Authorization: `Bearer ${getProviderKey("a2e")}`,
    ...(json ? { "Content-Type": "application/json" } : {})
  };
}

function extensionForMime(mime: string) {
  const normalized = String(mime || "").toLowerCase().split(";")[0].trim();
  const map: Record<string, string> = {
    "image/png": "png",
    "image/webp": "webp",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/mp4": "m4a",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/webm": "webm"
  };
  return map[normalized] || "bin";
}

export async function uploadA2eBytes(bytes: Buffer, mime: string, prefix = "video-engine"): Promise<string> {
  if (!bytes.length) throw new Error("A2E upload is empty");
  const key = `${prefix}/${crypto.randomUUID()}.${extensionForMime(mime)}`;
  const presign = await fetch(`${A2E_BASE}/r2/upload-presigned-url`, {
    method: "POST",
    headers: a2eHeaders(),
    body: JSON.stringify({ key, contentType: mime, contentLength: bytes.length, expiresIn: 900 }),
    cache: "no-store"
  });
  if (!presign.ok) throw new Error(`A2E upload URL HTTP ${presign.status}: ${(await presign.text()).slice(0, 300)}`);
  const payload = await presign.json() as { data?: { uploadUrl?: string; cdnUrl?: string } };
  const uploadUrl = payload.data?.uploadUrl;
  const cdnUrl = payload.data?.cdnUrl;
  if (!uploadUrl || !cdnUrl) throw new Error("A2E upload endpoint did not return uploadUrl and cdnUrl");
  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": mime, "Content-Length": String(bytes.length) },
    body: bytes
  });
  if (!put.ok) throw new Error(`A2E media upload HTTP ${put.status}: ${(await put.text()).slice(0, 200)}`);
  return cdnUrl;
}

export async function uploadA2eBase64(base64: string, mime: string, prefix = "video-engine") {
  return uploadA2eBytes(Buffer.from(base64, "base64"), mime, prefix);
}

export function extractA2eId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  for (const key of ["_id", "id", "task_id", "taskId", "video_id", "videoId", "record_id", "recordId"]) {
    if (typeof obj[key] === "string" && obj[key]) return String(obj[key]);
  }
  for (const key of ["data", "record", "task", "result", "video"]) {
    const nested = extractA2eId(obj[key]);
    if (nested) return nested;
  }
  return null;
}

export function findA2eString(value: unknown, keys: string[]): string | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  for (const key of keys) {
    if (typeof obj[key] === "string" && obj[key]) return String(obj[key]);
  }
  for (const nested of Object.values(obj)) {
    if (nested && typeof nested === "object") {
      const found = findA2eString(nested, keys);
      if (found) return found;
    }
  }
  return null;
}

export function normalizedA2eState(value: unknown) {
  const state = (findA2eString(value, ["state", "status", "current_status", "task_status", "progress_status"]) || "").toLowerCase();
  if (["success", "succeeded", "completed", "complete", "done", "finished", "ready"].includes(state)) return "success" as const;
  if (["failed", "fail", "error", "cancelled", "canceled", "rejected"].includes(state)) return "failed" as const;
  return "pending" as const;
}

export function a2eOutputUrl(value: unknown) {
  return findA2eString(value, [
    "video_output",
    "video_url",
    "result_video_url",
    "output_url",
    "result_url",
    "download_url",
    "cdn_url",
    "url"
  ]);
}
