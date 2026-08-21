// Hedra v3 video adapter (https://www.hedra.com/docs/pages/developer/v3/quickstart).
//
// Lifecycle (uniform across all Hedra models):
//   Start:   POST https://api.hedra.com/v3/models/{model_id}
//            body { input: { prompt, aspect_ratio, resolution, duration_ms?, start_image? } }
//            Authorization: Key <key_id>:<secret>
//            -> 202 { job_id }
//   Poll:    GET  https://api.hedra.com/v3/jobs/{job_id}/status
//            -> { status: "IN_QUEUE"|"IN_PROGRESS"|"COMPLETED"|"FAILED", progress }
//   Result:  GET  https://api.hedra.com/v3/jobs/{job_id}
//            -> { outputs: [{ url }] }   (when COMPLETED)
//
// ONE-CONTINUOUS-SHOT-ONLY honored: we clamp duration to 8000ms (8s) so any
// Hedra model we route a VIDEO-Engine job through stays in single-shot mode
// (the operator can override up to 10s via Hedra's own UI later).

import fs from "node:fs";
import path from "node:path";
import { getProviderKey, getProviderModel } from "@/lib/providers";

export type HedraStartInput = {
  prompt: string;
  aspectRatio: "9:16" | "16:9";
  resolution: "720p" | "1080p" | "4k";
  model?: string;
  imageBase64?: string;
  imageMimeType?: string;
};

const BASE = "https://api.hedra.com/v3";

function authHeaders() {
  return {
    "Authorization": `Key ${getProviderKey("hedra")}`,
    "Content-Type": "application/json"
  };
}

function hedraResolution(r: "720p" | "1080p" | "4k"): "720p" | "1080p" {
  // Hedra v3 model cards expose 720p / 1080p; 4k is not in the standard set
  return r === "720p" ? "720p" : "1080p";
}

export async function startOneShot(input: HedraStartInput): Promise<string> {
  const model = input.model || getProviderModel("hedra");

  const inputBody: Record<string, unknown> = {
    prompt: input.prompt,
    aspect_ratio: input.aspectRatio,
    resolution: hedraResolution(input.resolution),
    duration_ms: 8000 // ONE-CONTINUOUS-SHOT-ONLY
  };
  if (input.imageBase64 && input.imageMimeType) {
    inputBody.start_image = {
      type: "base64",
      media_type: input.imageMimeType,
      data: input.imageBase64
    };
  }

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
    method: "GET",
    headers: authHeaders(),
    cache: "no-store"
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
  const json = await res.json() as {
    status?: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | string;
    error?: string;
  };

  if (json.status === "FAILED") {
    throw new Error(json.error || "Hedra generation failed");
  }
  if (json.status !== "COMPLETED") return { done: false };

  // Fetch the result to read outputs[0].url
  const r = await fetch(`${BASE}/jobs/${encodeURIComponent(taskId)}`, {
    method: "GET",
    headers: authHeaders(),
    cache: "no-store"
  });
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
