import crypto from "node:crypto";
import { db } from "@/lib/db";
import { compileVeoPrompt } from "@/lib/prompt-compiler";
import type { CampaignCategory } from "@/lib/prompts";
import { getEngineSettings } from "@/lib/settings";
import { pollOneShot, startOneShot } from "@/lib/veo";

export type CreateJobInput = {
  source: "admin" | "api";
  category: CampaignCategory;
  mission?: string;
  subject?: string;
  script?: string;
  aspectRatio?: "9:16" | "16:9";
  resolution?: "720p" | "1080p" | "4k";
  model?: string;
  imageBase64?: string;
  imageMimeType?: string;
};

export async function createJob(input: CreateJobInput) {
  const defaults = getEngineSettings();
  const id = crypto.randomUUID();
  const prompt = compileVeoPrompt(input);
  const model = input.model || defaults.model;
  const aspect = input.aspectRatio || defaults.aspectRatio;
  const resolution = input.resolution || defaults.resolution;
  db.prepare("INSERT INTO video_jobs(id,source,category,prompt,model,aspect_ratio,resolution,status) VALUES(?,?,?,?,?,?,?,?)")
    .run(id, input.source, input.category, prompt, model, aspect, resolution, "starting");
  try {
    const operation = await startOneShot({ prompt, model, aspectRatio: aspect, resolution, imageBase64: input.imageBase64, imageMimeType: input.imageMimeType });
    db.prepare("UPDATE video_jobs SET provider_operation=?,status='running',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(operation, id);
    return getJob(id)!;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    db.prepare("UPDATE video_jobs SET status='failed',error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(message, id);
    throw error;
  }
}

export function getJob(id: string) {
  return db.prepare("SELECT id,source,category,prompt,model,aspect_ratio as aspectRatio,resolution,provider_operation as providerOperation,status,error,output_path as outputPath,created_at as createdAt,updated_at as updatedAt FROM video_jobs WHERE id=?").get(id) as any;
}

export async function refreshJob(id: string) {
  const job = getJob(id);
  if (!job) return null;
  if (["succeeded", "failed"].includes(job.status)) return job;
  if (!job.providerOperation) return job;
  try {
    const result = await pollOneShot(job.providerOperation, id);
    if (!result.done) return job;
    db.prepare("UPDATE video_jobs SET status='succeeded',output_path=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(result.outputPath, id);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    db.prepare("UPDATE video_jobs SET status='failed',error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(message, id);
  }
  return getJob(id);
}
