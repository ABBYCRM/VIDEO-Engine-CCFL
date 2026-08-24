// A2E multi-model media adapter. Each selectable model is compiled into its
// provider-native A2E request contract rather than being treated as a Veo shim.

import fs from "node:fs";
import path from "node:path";
import { getProviderModel } from "@/lib/providers";
import { getA2eModel, type A2eModelFamily } from "@/lib/a2e-model-catalog";
import {
  A2E_BASE,
  a2eHeaders,
  a2eOutputUrl,
  extractA2eId,
  findA2eString,
  normalizedA2eState,
  uploadA2eBase64
} from "@/lib/a2e-shared";

export type A2eStartInput = {
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

type StoredOperation = { family: A2eModelFamily; id: string };
const FAMILIES: A2eModelFamily[] = [
  "video-twin", "a2e-i2v", "wan25", "wan26-r2v", "wan-spicy", "wan30", "happyhorse",
  "veo", "kling", "kling-omni", "grok", "hailuo", "minimax-h3", "sora", "seedance15", "seedance2"
];

function encodeOperation(op: StoredOperation) { return `${op.family}:${op.id}`; }
function decodeOperation(raw: string): StoredOperation {
  const colon = raw.indexOf(":");
  if (colon > 0) {
    const family = raw.slice(0, colon) as A2eModelFamily;
    if (FAMILIES.includes(family)) return { family, id: raw.slice(colon + 1) };
  }
  return { family: "veo", id: raw };
}

function endpointForFamily(family: A2eModelFamily) {
  const map: Record<A2eModelFamily, string> = {
    "video-twin": "video",
    "a2e-i2v": "userImage2Video",
    wan25: "userWan25",
    "wan26-r2v": "userWan26R2V",
    "wan-spicy": "userWanSpicy",
    wan30: "userWan30",
    happyhorse: "userHappyhorseVideo",
    veo: "veoVideo",
    kling: "klingVideo",
    "kling-omni": "klingOmni",
    grok: "grokVideo",
    hailuo: "hailuoVideo",
    "minimax-h3": "minimaxH3Video",
    sora: "soraVideo",
    seedance15: "seedanceVideo",
    seedance2: "seedance2Video"
  };
  return map[family];
}

function clamp(value: number | undefined, min: number, max: number, fallback: number) {
  const n = Number(value ?? fallback);
  return Math.max(min, Math.min(max, Math.round(Number.isFinite(n) ? n : fallback)));
}
function nearest(value: number, allowed: number[]) {
  if (!allowed.length) return value;
  return allowed.reduce((best, current) => Math.abs(current - value) < Math.abs(best - value) ? current : best, allowed[0]);
}
function selectedDuration(modelId: string, requested: number | undefined) {
  const def = getA2eModel(modelId);
  if (!def) return clamp(requested, 2, 30, 8);
  const wanted = clamp(requested, Math.min(...def.durations), Math.max(...def.durations), def.durations[def.durations.length - 1]);
  return nearest(wanted, def.durations);
}
function taskName() { return `VIDEO-Engine ${new Date().toISOString()}`; }
function requireImage(model: string, imageUrl: string | null) {
  if (!imageUrl) throw new Error(`${getA2eModel(model)?.label || model} requires a reference image.`);
  return imageUrl;
}

function familyPayload(input: A2eStartInput, model: string, family: A2eModelFamily, imageUrl: string | null, audioUrl: string | null) {
  const duration = selectedDuration(model, input.durationSeconds);
  const name = taskName();

  if (family === "video-twin") {
    throw new Error("A2E Video Twin is a trained-avatar workflow. Choose a canonical avatar with a ready Video Twin; VIDEO-Engine will route it through the avatar generator automatically.");
  }

  if (family === "a2e-i2v") {
    return {
      endpoint: "userImage2Video",
      body: {
        name,
        image_url: requireImage(model, imageUrl),
        prompt: input.prompt,
        model_type: "GENERAL",
        model_version: model === "a2e-v2-i2v" ? "a2e-v2" : model === "a2e-v2-flash-i2v" ? "a2e-v2-flash" : "a2e",
        video_time: duration,
        extend_prompt: true,
        number_of_images: 1,
        skip_face_enhance: false
      }
    };
  }

  if (family === "wan25") {
    const is27 = model === "wan2.7-i2v";
    if (!is27) {
      return {
        endpoint: "userWan25",
        body: {
          name,
          model,
          image_url: requireImage(model, imageUrl),
          prompt: input.prompt,
          duration: String(nearest(duration, [5, 10, 15])),
          resolution: input.resolution === "4k" ? "1080p" : input.resolution,
          enable_prompt_expansion: false,
          audio: true,
          ...(audioUrl ? { audio_url: audioUrl } : {})
        }
      };
    }
    return {
      endpoint: "userWan25",
      body: imageUrl ? {
        name,
        model,
        task_type: "reference_image",
        reference_image_urls: [imageUrl],
        prompt: input.prompt,
        duration: String(duration),
        resolution: input.resolution === "4k" ? "1080p" : input.resolution,
        ratio: input.aspectRatio,
        enable_prompt_expansion: false,
        audio: true
      } : {
        name,
        model,
        task_type: "text_to_video",
        prompt: input.prompt,
        duration: String(nearest(duration, [5, 10, 15])),
        resolution: input.resolution === "4k" ? "1080p" : input.resolution,
        ratio: input.aspectRatio,
        enable_prompt_expansion: false,
        audio: true
      }
    };
  }

  if (family === "wan26-r2v") {
    return {
      endpoint: "userWan26R2V",
      body: {
        model,
        name,
        reference_urls: [requireImage(model, imageUrl)],
        prompt: input.prompt,
        duration: String(nearest(duration, [5, 10])),
        resolution: input.resolution === "720p" ? "720p" : "1080p",
        aspect_ratio: input.aspectRatio,
        shot_type: "single",
        audio: true
      }
    };
  }

  if (family === "wan-spicy") {
    const is27 = model === "wan2.7-i2v-spicy";
    return {
      endpoint: "userWanSpicy",
      body: {
        model,
        name,
        prompt: input.prompt,
        image_url: requireImage(model, imageUrl),
        resolution: is27 ? (input.resolution === "720p" ? "720p" : "1080p") : "720p",
        duration: is27 ? duration : nearest(duration, [5, 8]),
        prompt_extend: true,
        ...(is27 && audioUrl ? { audio_url: audioUrl } : {})
      }
    };
  }

  if (family === "wan30") {
    const media: Array<{ type: string; url: string }> = [];
    if (imageUrl) media.push({ type: audioUrl ? "reference_image" : "first_frame", url: imageUrl });
    if (audioUrl) media.push({ type: "reference_audio", url: audioUrl });
    const mode = audioUrl ? "reference" : imageUrl ? "first-frame" : "text-to-video";
    return {
      endpoint: "userWan30",
      body: {
        name,
        model,
        force_generate: true,
        mode,
        input: { prompt: input.prompt, media },
        parameters: {
          resolution: input.resolution === "4k" ? "1080P" : input.resolution.toUpperCase(),
          ratio: input.aspectRatio,
          duration,
          audio: true,
          prompt_extend: false,
          watermark: false
        }
      }
    };
  }

  if (family === "happyhorse") {
    const version = model === "happyhorse-1.1" ? "1.1" : "1.0";
    const d = version === "1.0" ? nearest(duration, [5, 10, 15]) : duration;
    return {
      endpoint: "userHappyhorseVideo",
      body: {
        mode: imageUrl ? "i2v" : "t2v",
        name,
        model_version: version,
        prompt: input.prompt,
        ...(imageUrl ? { image_url: imageUrl } : {}),
        duration: String(d),
        resolution: input.resolution === "720p" ? "720P" : "1080P",
        ratio: input.aspectRatio,
        watermark: false
      }
    };
  }

  if (family === "veo") {
    return {
      endpoint: "veoVideo",
      body: {
        name,
        prompt: input.prompt,
        generationType: imageUrl ? "REFERENCE_2_VIDEO" : "TEXT_2_VIDEO",
        ...(imageUrl ? { imageUrls: [imageUrl] } : {}),
        model: model === "veo3" ? "veo3" : "veo3_fast",
        aspectRatio: input.aspectRatio
      }
    };
  }

  if (family === "kling") {
    const version = model === "kling2.6" ? "2.6" : "3.0";
    const fast = model === "kling3-fast";
    const d = version === "2.6" ? nearest(duration, [5, 10]) : duration;
    const quality = input.resolution === "4k" && version === "3.0" && !fast ? "4k" : input.resolution === "1080p" ? "pro" : version === "2.6" ? "pro" : "std";
    return {
      endpoint: "klingVideo",
      body: {
        name,
        mode: imageUrl ? "image-to-video" : "text-to-video",
        prompt: input.prompt,
        version,
        model_version: fast ? "fast" : "standard",
        duration: String(d),
        sound: version === "3.0" || quality === "pro",
        ...(imageUrl ? { image_url: imageUrl } : { aspect_ratio: input.aspectRatio }),
        ...(fast ? { resolution: input.resolution === "720p" ? "720p" : "1080p" } : { quality_mode: quality })
      }
    };
  }

  if (family === "kling-omni") {
    return {
      endpoint: "klingOmni",
      body: {
        name,
        prompt: input.prompt,
        ...(imageUrl ? { image_list: [imageUrl] } : {}),
        mode: model.endsWith("pro") ? "pro" : "std",
        duration: String(duration),
        aspect_ratio: input.aspectRatio,
        sound: true,
        multi_shot: false
      }
    };
  }

  if (family === "grok") {
    if (model === "grok-video-1.5" && !imageUrl) throw new Error("A2E Grok Imagine Video 1.5 requires a reference image.");
    return {
      endpoint: "grokVideo",
      body: {
        name,
        model_type: imageUrl ? "image-to-video" : "text-to-video",
        model_version: model === "grok-video-1.5" ? "1.5" : "legacy",
        prompt: input.prompt,
        mode: "normal",
        ...(imageUrl ? { image_urls: [imageUrl] } : {}),
        aspect_ratio: input.aspectRatio,
        duration: String(nearest(duration, [6, 10, 15])),
        nsfw_checker: false
      }
    };
  }

  if (family === "hailuo") {
    const d = nearest(duration, [6, 10]);
    return {
      endpoint: "hailuoVideo",
      body: {
        name,
        prompt: input.prompt,
        image_urls: [requireImage(model, imageUrl)],
        resolution: d === 10 ? "768P" : input.resolution === "720p" ? "768P" : "1080P",
        duration: String(d)
      }
    };
  }

  if (family === "minimax-h3") {
    return {
      endpoint: "minimaxH3Video",
      body: {
        name,
        mode: imageUrl ? "image-to-video" : "text-to-video",
        prompt: input.prompt,
        ...(imageUrl ? { first_frame_url: imageUrl } : {}),
        resolution: input.resolution === "720p" ? "768P" : "2K",
        duration: String(duration),
        aspect_ratio: input.aspectRatio
      }
    };
  }

  if (family === "sora") {
    return {
      endpoint: "soraVideo",
      body: {
        name,
        model_type: imageUrl ? "image-to-video" : "text-to-video",
        prompt: input.prompt,
        ...(imageUrl ? { image_urls: [imageUrl] } : {}),
        aspect_ratio: input.aspectRatio === "9:16" ? "portrait" : "landscape",
        duration_seconds: String(nearest(duration, [5, 10, 15])),
        quality: input.resolution === "720p" ? "standard" : "high"
      }
    };
  }

  if (family === "seedance15") {
    return {
      endpoint: "seedanceVideo",
      body: {
        name,
        mode: imageUrl ? "image-to-video" : "text-to-video",
        prompt: input.prompt,
        ...(imageUrl ? { image_url: imageUrl } : {}),
        duration: String(nearest(duration, [5, 10])),
        aspect_ratio: input.aspectRatio,
        resolution: "720p",
        camera_fixed: false,
        generate_audio: true
      }
    };
  }

  const modelVersion = model === "seedance2.5" ? "2.5" : model.replace("seedance2-", "");
  const max = modelVersion === "2.5" ? 30 : 15;
  const d = clamp(duration, 4, max, 8);
  return {
    endpoint: "seedance2Video",
    body: {
      name,
      mode: imageUrl ? "image-to-video" : "text-to-video",
      prompt: input.prompt,
      model_version: modelVersion,
      duration: d,
      resolution: modelVersion === "2.5"
        ? (input.resolution === "4k" ? "1080p" : input.resolution)
        : modelVersion === "standard"
          ? input.resolution
          : input.resolution === "720p" ? "720p" : "720p",
      aspect_ratio: input.aspectRatio,
      generate_audio: true,
      ...(imageUrl ? { image_url: imageUrl } : {})
    }
  };
}

export async function startOneShot(input: A2eStartInput): Promise<string> {
  const model = input.model || getProviderModel("a2e");
  const def = getA2eModel(model);
  if (!def) throw new Error(`Unsupported A2E model: ${model}`);
  const imageUrl = input.imageBase64 && input.imageMimeType
    ? await uploadA2eBase64(input.imageBase64, input.imageMimeType, "video-engine/references")
    : null;
  const audioUrl = input.audioBase64 && input.audioMimeType
    ? await uploadA2eBase64(input.audioBase64, input.audioMimeType, "video-engine/audio")
    : null;
  if (def.requiresImage && !imageUrl) throw new Error(`${def.label} requires a reference image.`);
  const { endpoint, body } = familyPayload(input, model, def.family, imageUrl, audioUrl);
  const res = await fetch(`${A2E_BASE}/${endpoint}/start`, {
    method: "POST",
    headers: a2eHeaders(),
    body: JSON.stringify(body),
    cache: "no-store"
  });
  if (!res.ok) throw new Error(`A2E ${def.label} start HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const json = await res.json();
  if (typeof json === "object" && json && "code" in json && Number((json as { code?: unknown }).code) !== 0) {
    const detail = findA2eString(json, ["err_message", "msg", "message", "error_message", "error", "reason", "detail"]);
    throw new Error(`A2E ${def.label} rejected task: ${detail || JSON.stringify(json).slice(0, 400)}`);
  }
  const id = extractA2eId(json);
  if (!id) throw new Error(`A2E ${def.label} accepted the request but did not return a task ID required for polling.`);
  return encodeOperation({ family: def.family, id });
}

function recordWithId(value: unknown, id: string): unknown | null {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = recordWithId(item, id);
      if (found) return found;
    }
    return null;
  }
  const obj = value as Record<string, unknown>;
  for (const key of ["_id", "id", "task_id", "taskId", "video_id", "videoId"]) {
    if (String(obj[key] || "") === id) return obj;
  }
  for (const child of Object.values(obj)) {
    const found = recordWithId(child, id);
    if (found) return found;
  }
  return null;
}

async function pollPayload(op: StoredOperation) {
  const endpoint = endpointForFamily(op.family);
  if (op.family === "seedance15") {
    const res = await fetch(`${A2E_BASE}/seedanceVideo/allRecords?pageNum=1&pageSize=100`, { headers: a2eHeaders(), cache: "no-store" });
    if (!res.ok) throw new Error(`A2E Seedance 1.5 poll HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const json = await res.json();
    return recordWithId(json, op.id) || json;
  }
  // Wan 3.0's published schema currently documents the asynchronous start contract
  // but omits the detail path; the deployed family follows the same /{id} record pattern.
  const res = await fetch(`${A2E_BASE}/${endpoint}/${encodeURIComponent(op.id)}`, {
    method: "GET",
    headers: a2eHeaders(),
    cache: "no-store"
  });
  if (!res.ok) throw new Error(`A2E ${op.family} poll HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

export type A2ePollResult = { done: false } | { done: true; outputPath: string };
export async function pollOneShot(rawOperation: string, jobId: string, resolution: "720p" | "1080p" | "4k" = "1080p"): Promise<A2ePollResult> {
  const op = decodeOperation(rawOperation);
  const json = await pollPayload(op);
  const state = normalizedA2eState(json);
  if (state === "failed") {
    const reason = findA2eString(json, ["failed_message", "fail_reason", "error_message", "error", "message"]);
    throw new Error(reason || `A2E ${op.family} generation failed`);
  }
  if (state !== "success") return { done: false };
  let videoUrl = a2eOutputUrl(json);
  if (!videoUrl && op.family === "veo") {
    const suffix = resolution === "720p" ? "720p" : "1080p";
    videoUrl = `${A2E_BASE}/veoVideo/${encodeURIComponent(op.id)}/${suffix}`;
  }
  if (!videoUrl) throw new Error(`A2E ${op.family} completed without a downloadable video URL.`);
  let videoRes = await fetch(videoUrl, { headers: a2eHeaders(false), cache: "no-store" });
  if (!videoRes.ok) videoRes = await fetch(videoUrl, { cache: "no-store" });
  if (!videoRes.ok) throw new Error(`Failed to download A2E ${op.family} video: HTTP ${videoRes.status}`);
  const bytes = Buffer.from(await videoRes.arrayBuffer());
  const outDir = path.resolve(process.env.VIDEO_OUTPUT_DIR || "./data/videos");
  fs.mkdirSync(outDir, { recursive: true });
  const outputPath = path.join(outDir, `${jobId}.mp4`);
  fs.writeFileSync(outputPath, bytes);
  return { done: true, outputPath };
}
