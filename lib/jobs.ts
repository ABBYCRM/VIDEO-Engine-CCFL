import crypto from "node:crypto";
import { db } from "@/lib/db";
import { compileVeoPrompt } from "@/lib/prompt-compiler";
import type { CampaignCategory } from "@/lib/prompts";
import { getEngineSettings } from "@/lib/settings";
import { PROVIDERS, getDefaultProvider, type ProviderId } from "@/lib/providers";
import { ensureAssetCalendarPost } from "@/lib/calendar-assets";
import * as veo from "@/lib/veo";
import * as grok from "@/lib/grok";
import * as a2e from "@/lib/a2e";
import * as hedra from "@/lib/hedra";

export type CreateJobInput = {
  source: "admin" | "api";
  provider?: ProviderId;
  category: CampaignCategory;
  mission?: string;
  subject?: string;
  script?: string;
  aspectRatio?: "9:16" | "16:9";
  resolution?: "720p" | "1080p" | "4k";
  model?: string;
  durationSeconds?: number;
  imageBase64?: string;
  imageMimeType?: string;
  audioBase64?: string;
  audioMimeType?: string;
};

function modelForProvider(p: ProviderId, requested: string | undefined) {
  const def = PROVIDERS[p];
  if (requested && def.modelChoices.includes(requested)) return requested;
  const raw = (db.prepare("SELECT value FROM settings WHERE key = ?").get(`${p}_model`) as { value: string } | undefined)?.value;
  return raw || def.defaultModel;
}

function providerError(provider: ProviderId, error: unknown) {
  if (error instanceof Error) {
    if (error.name === "AbortError" || /operation was aborted|aborted/i.test(error.message)) {
      return `${PROVIDERS[provider].label} did not respond before the provider request was cancelled. Retry generation; no media was created.`;
    }
    return error.message;
  }
  return String(error);
}

async function startProviderOperation(args: {
  id: string;
  provider: ProviderId;
  prompt: string;
  model: string;
  aspectRatio: "9:16" | "16:9";
  resolution: "720p" | "1080p" | "4k";
  input: CreateJobInput;
}) {
  const { id, provider, prompt, model, aspectRatio, resolution, input } = args;
  try {
    db.prepare("UPDATE video_jobs SET status='starting',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(id);
    let operation: string;
    if (provider === "veo") {
      operation = await veo.startOneShot({ prompt, model, aspectRatio, resolution, imageBase64: input.imageBase64, imageMimeType: input.imageMimeType });
    } else if (provider === "grok") {
      operation = await grok.startOneShot({ prompt, model, aspectRatio, resolution, imageBase64: input.imageBase64, imageMimeType: input.imageMimeType });
    } else if (provider === "hedra") {
      operation = await hedra.startOneShot({
        prompt,
        model,
        aspectRatio,
        resolution,
        durationSeconds: input.durationSeconds,
        imageBase64: input.imageBase64,
        imageMimeType: input.imageMimeType,
        audioBase64: input.audioBase64,
        audioMimeType: input.audioMimeType
      });
    } else {
      operation = await a2e.startOneShot({ prompt, model, aspectRatio, resolution, imageBase64: input.imageBase64, imageMimeType: input.imageMimeType });
    }
    db.prepare("UPDATE video_jobs SET provider_operation=?,status='running',error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(operation, id);
  } catch (error) {
    db.prepare("UPDATE video_jobs SET status='failed',error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(providerError(provider, error), id);
  }
}

export async function createJob(input: CreateJobInput) {
  const defaults = getEngineSettings();
  const provider: ProviderId = input.provider || defaults.defaultProvider || getDefaultProvider();
  const id = crypto.randomUUID();
  const prompt = compileVeoPrompt(input);
  const model = modelForProvider(provider, input.model);
  const aspectRatio = input.aspectRatio || defaults.aspectRatio;
  const resolution = input.resolution || defaults.resolution;

  db.prepare("INSERT INTO video_jobs(id,source,category,prompt,provider,model,aspect_ratio,resolution,status) VALUES(?,?,?,?,?,?,?,?,?)")
    .run(id, input.source, input.category, prompt, provider, model, aspectRatio, resolution, "queued");

  // Never hold the user's HTTP request open while a paid provider accepts a job.
  // The UI receives the local job immediately and polls while provider startup runs.
  setImmediate(() => {
    void startProviderOperation({ id, provider, prompt, model, aspectRatio, resolution, input });
  });

  return getJob(id)!;
}

export function getJob(id: string) {
  return db.prepare("SELECT id,source,category,prompt,provider,model,aspect_ratio as aspectRatio,resolution,provider_operation as providerOperation,status,error,output_path as outputPath,created_at as createdAt,updated_at as updatedAt FROM video_jobs WHERE id=?").get(id) as any;
}

export async function refreshJob(id: string, options?: { ensureCalendar?: boolean }) {
  const job = getJob(id);
  if (!job) return null;
  if (["succeeded", "failed"].includes(job.status)) return job;
  if (!job.providerOperation) return job;

  try {
    let result: { done: false } | { done: true; outputPath: string };
    if (job.provider === "grok") result = await grok.pollOneShot(job.providerOperation, id);
    else if (job.provider === "a2e") result = await a2e.pollOneShot(job.providerOperation, id, job.resolution);
    else if (job.provider === "hedra") result = await hedra.pollOneShot(job.providerOperation, id, job.resolution);
    else result = await veo.pollOneShot(job.providerOperation, id);

    if (!result.done) return job;
    db.prepare("UPDATE video_jobs SET status='succeeded',output_path=?,error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(result.outputPath, id);
    if (options?.ensureCalendar !== false) {
      ensureAssetCalendarPost({
        sourceKey: `video:${id}`,
        title: `${String(job.category).replaceAll("_", " ")} · ${job.provider}`,
        contentType: job.category === "ugc" ? "ugc" : "cinematic",
        mediaUrl: `/api/v1/video/${id}/file`,
        mediaType: "video/mp4",
        caption: job.prompt?.slice(0, 1000) || "Generated campaign video",
        videoJobId: id
      });
    }
  } catch (error) {
    const provider = job.provider as ProviderId;
    db.prepare("UPDATE video_jobs SET status='failed',error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(providerError(provider, error), id);
  }
  return getJob(id);
}
