import fs from "node:fs";
import path from "node:path";
import { getProviderKey, getProviderModel } from "@/lib/providers";

export type HedraStartInput = {
  prompt: string;
  aspectRatio: "9:16" | "16:9";
  resolution: "720p" | "1080p" | "4k";
  model?: string;
  durationSeconds?: number;
  imageBase64?: string;
  imageMimeType?: string;
  audioBase64?: string;
  audioMimeType?: string;
};

const BASE = "https://api.hedra.com/v3";

function authHeaders() {
  return { "Authorization": `Key ${getProviderKey("hedra")}`, "Content-Type": "application/json" };
}

function hedraResolution(r: "720p" | "1080p" | "4k"): "720p" | "1080p" {
  return r === "720p" ? "720p" : "1080p";
}

function mediaRef(base64: string, mimeType: string) {
  return { type: "base64", media_type: mimeType, data: base64 };
}

function isLongformAvatarModel(model: string) {
  return model === "hedra-character-3" || model === "hedra-character-2" || model === "together/hedra-avatar";
}

export async function startOneShot(input: HedraStartInput): Promise<string> {
  const model = input.model || getProviderModel("hedra");
  const durationSeconds = Math.max(1, Math.min(30, Math.round(input.durationSeconds || 30)));

  if (isLongformAvatarModel(model) && (!input.imageBase64 || !input.imageMimeType)) {
    throw new Error("Hedra Character/Avatar requires a start image");
  }
  if (isLongformAvatarModel(model) && (!input.audioBase64 || !input.audioMimeType)) {
    throw new Error("Hedra Character/Avatar requires driving audio. Upload or generate audio for the script first.");
  }

  const inputBody: Record<string, unknown> = {
    prompt: input.prompt,
    aspect_ratio: input.aspectRatio,
    resolution: hedraResolution(input.resolution),
    duration_ms: durationSeconds * 1000
  };
  if (input.imageBase64 && input.imageMimeType) inputBody.start_image = mediaRef(input.imageBase64, input.imageMimeType);
  if (input.audioBase64 && input.audioMimeType) inputBody.audio = mediaRef(input.audioBase64, input.audioMimeType);

  const res = await fetch(`${BASE}/models/${encodeURIComponent(model)}`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ input: inputBody }),
    cache: "no-store"
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = `Hedra start HTTP ${res.status}`;
    try {
      const j = JSON.parse(text);
      msg = j?.error?.message || j?.message || msg;
    } catch {}
    throw new Error(msg);
  }
  const json = await res.json() as { job_id?: string; data?: { job_id?: string } };
  const jobId = json.job_id || json.data?.job_id;
  if (!jobId) throw new Error("Hedra did not return a job_id");
  return jobId;
}

export type HedraPollResult = { done: false } | { done: true; outputPath: string };

export async function pollOneShot(taskId: string, jobId: string, _resolution: "720p" | "1080p" | "4k" = "1080p"): Promise<HedraPollResult> {
  const res = await fetch(`${BASE}/jobs/${encodeURIComponent(taskId)}/status`, {
    method: "GET", headers: authHeaders(), cache: "no-store"
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = `Hedra status HTTP ${res.status}`;
    try {
      const j = JSON.parse(text);
      msg = j?.error?.message || j?.message || msg;
    } catch {}
    throw new Error(msg);
  }
  const json = await res.json() as { status?: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | string; error?: string };
  if (json.status === "FAILED") throw new Error(json.error || "Hedra generation failed");
  if (json.status !== "COMPLETED") return { done: false };

  const r = await fetch(`${BASE}/jobs/${encodeURIComponent(taskId)}`, { method: "GET", headers: authHeaders(), cache: "no-store" });
  if (!r.ok) throw new Error(`Hedra result HTTP ${r.status}`);
  const result = await r.json() as { outputs?: Array<{ url?: string }> };
  const videoUrl = result.outputs?.[0]?.url;
  if (!videoUrl) throw new Error("Hedra returned no output URL");

  const videoRes = await fetch(videoUrl, { cache: "no-store" });
  if (!videoRes.ok) throw new Error(`Failed to download Hedra video: HTTP ${videoRes.status}`);
  const bytes = Buffer.from(await videoRes.arrayBuffer());
  const outDir = path.resolve(process.env.VIDEO_OUTPUT_DIR || "./data/videos");
  fs.mkdirSync(outDir, { recursive: true });
  const outputPath = path.join(outDir, `${jobId}.mp4`);
  fs.writeFileSync(outputPath, bytes);
  return { done: true, outputPath };
}
