import fs from "node:fs";
import path from "node:path";
import {
  A2E_BASE,
  a2eHeaders,
  a2eOutputUrl,
  extractA2eId,
  findA2eString,
  normalizedA2eState,
  uploadA2eBase64
} from "@/lib/a2e-shared";

export type A2eTwinTrainingInput = {
  name: string;
  gender?: "male" | "female" | "non-binary";
  imageBase64?: string;
  imageMimeType?: string;
  videoBase64?: string;
  videoMimeType?: string;
  imageUrl?: string;
  videoUrl?: string;
  backgroundImageUrl?: string;
  backgroundColor?: string;
};

export type A2eTwinTrainingPoll =
  | { done: false; status: "pending"; raw: unknown }
  | { done: true; status: "completed"; twinId: string; anchorId: string; raw: unknown }
  | { done: true; status: "failed"; error: string; raw: unknown };

function twinAnchorId(value: unknown, fallback: string) {
  return findA2eString(value, ["anchor_id", "anchorId", "avatar_id", "avatarId", "custom_anchor_id", "customAnchorId"]) || fallback;
}

export async function startTwinTraining(input: A2eTwinTrainingInput) {
  const imageUrl = input.imageUrl || (input.imageBase64 && input.imageMimeType
    ? await uploadA2eBase64(input.imageBase64, input.imageMimeType, "video-engine/twins/images")
    : undefined);
  const videoUrl = input.videoUrl || (input.videoBase64 && input.videoMimeType
    ? await uploadA2eBase64(input.videoBase64, input.videoMimeType, "video-engine/twins/videos")
    : undefined);

  if (!imageUrl && !videoUrl) throw new Error("A2E Video Twin training needs a source image or source video.");

  const body = {
    name: input.name.slice(0, 80),
    ...(imageUrl ? { image_url: imageUrl } : {}),
    ...(videoUrl ? { video_url: videoUrl } : {}),
    ...(input.backgroundImageUrl ? { video_background_image: input.backgroundImageUrl } : {}),
    ...(input.backgroundColor ? { video_background_color: input.backgroundColor } : {}),
    ...(input.gender && input.gender !== "non-binary" ? { gender: input.gender } : {}),
    isTranscoding: true,
    skipPreview: false,
    prompt: "Fixed shot, still background, the person is speaking, clear teeth, natural blink",
    negative_prompt: "Moving background, six fingers, bad hands, low quality, worst quality, moving viewpoint"
  };

  const res = await fetch(`${A2E_BASE}/userVideoTwin/startTraining`, {
    method: "POST",
    headers: a2eHeaders(),
    body: JSON.stringify(body),
    cache: "no-store"
  });
  if (!res.ok) throw new Error(`A2E Video Twin training HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const json = await res.json();
  if (typeof json === "object" && json && "code" in json && Number((json as { code?: unknown }).code) !== 0) {
    throw new Error(`A2E Video Twin rejected training: ${String((json as { message?: unknown }).message || "Request failed")}`);
  }
  const id = extractA2eId(json);
  if (!id) throw new Error("A2E Video Twin accepted training but did not return a task ID.");
  return id;
}

export async function pollTwinTraining(id: string): Promise<A2eTwinTrainingPoll> {
  const res = await fetch(`${A2E_BASE}/userVideoTwin/${encodeURIComponent(id)}`, {
    method: "GET",
    headers: a2eHeaders(),
    cache: "no-store"
  });
  if (!res.ok) throw new Error(`A2E Video Twin status HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  const state = normalizedA2eState(json);
  if (state === "failed") {
    return {
      done: true,
      status: "failed",
      error: findA2eString(json, ["failed_message", "fail_reason", "error_message", "error", "message"]) || "A2E Video Twin training failed",
      raw: json
    };
  }
  if (state !== "success") return { done: false, status: "pending", raw: json };
  const twinId = extractA2eId(json) || id;
  return { done: true, status: "completed", twinId, anchorId: twinAnchorId(json, twinId), raw: json };
}

export async function startTwinVideo(input: {
  anchorId: string;
  audioBase64: string;
  audioMimeType: string;
  title?: string;
  resolution?: "720p" | "1080p" | "4k";
}) {
  if (!input.anchorId) throw new Error("A2E Video Twin is not trained for the selected avatar yet.");
  if (!input.audioBase64 || !input.audioMimeType) throw new Error("A2E Video Twin needs driving audio.");
  const audioUrl = await uploadA2eBase64(input.audioBase64, input.audioMimeType, "video-engine/twins/audio");
  const res = await fetch(`${A2E_BASE}/video/generate`, {
    method: "POST",
    headers: a2eHeaders(),
    body: JSON.stringify({
      title: (input.title || "VIDEO-Engine Twin").slice(0, 40),
      audioSrc: audioUrl,
      anchor_id: input.anchorId,
      anchor_type: 1,
      resolution: input.resolution === "720p" ? 720 : 1080,
      isCaptionEnabled: false,
      isToPublicPool: false
    }),
    cache: "no-store"
  });
  if (!res.ok) throw new Error(`A2E Video Twin generation HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const json = await res.json();
  if (typeof json === "object" && json && "code" in json && Number((json as { code?: unknown }).code) !== 0) {
    throw new Error(`A2E Video Twin rejected generation: ${String((json as { message?: unknown }).message || "Request failed")}`);
  }
  const id = extractA2eId(json);
  if (!id) throw new Error("A2E Video Twin accepted generation but did not return a video task ID.");
  return `video-twin:${id}`;
}

export type A2eTwinVideoPoll = { done: false } | { done: true; outputPath: string };

export async function pollTwinVideo(rawOperation: string, jobId: string): Promise<A2eTwinVideoPoll> {
  const id = rawOperation.startsWith("video-twin:") ? rawOperation.slice("video-twin:".length) : rawOperation;
  const res = await fetch(`${A2E_BASE}/video/detail?video_id=${encodeURIComponent(id)}`, {
    method: "GET",
    headers: a2eHeaders(),
    cache: "no-store"
  });
  if (!res.ok) throw new Error(`A2E Video Twin poll HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  const state = normalizedA2eState(json);
  if (state === "failed") {
    throw new Error(findA2eString(json, ["failed_message", "fail_reason", "error_message", "error", "message"]) || "A2E Video Twin generation failed");
  }
  if (state !== "success") return { done: false };
  const url = a2eOutputUrl(json);
  if (!url) throw new Error("A2E Video Twin completed without a downloadable video URL.");
  let videoRes = await fetch(url, { headers: a2eHeaders(false), cache: "no-store" });
  if (!videoRes.ok) videoRes = await fetch(url, { cache: "no-store" });
  if (!videoRes.ok) throw new Error(`Failed to download A2E Video Twin video: HTTP ${videoRes.status}`);
  const bytes = Buffer.from(await videoRes.arrayBuffer());
  const outDir = path.resolve(process.env.VIDEO_OUTPUT_DIR || "./data/videos");
  fs.mkdirSync(outDir, { recursive: true });
  const outputPath = path.join(outDir, `${jobId}.mp4`);
  fs.writeFileSync(outputPath, bytes);
  return { done: true, outputPath };
}
