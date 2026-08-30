import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { VIEWS, type AvatarView } from "@/lib/avatars";

import { uploadA2eBase64 } from "@/lib/a2e-shared";
import { getProviderKey } from "@/lib/providers";

export type ImageProvider = "gemini" | "openai" | "xai" | "a2e" | "hedra" | "mock";
const SETTING_KEY = "image_api_key";
const SETTING_MODEL_KEY = "image_model";
const SETTING_PROVIDER_KEY = "image_provider";
export const IMAGE_PROVIDER_MODELS: Record<ImageProvider, string[]> = {
  gemini: ["gemini-2.5-flash-image", "gemini-3.1-flash-image-preview", "gemini-3.1-flash-image", "gemini-3.1-flash-lite-image"],
  openai: ["gpt-image-1", "dall-e-3"],
  xai: ["grok-imagine-image", "grok-imagine-image-2.0", "grok-imagine-image-quality"],
  a2e: ["gpt-image-1.5", "gpt-image-2"],
  hedra: ["gpt-image-2", "flux2-max", "flux-kontext", "nano-banana-pro", "imagen-4", "seedream-5", "ideogram-v4", "recraft-v3"],
  mock: ["mock-stable-diffusion-1"]
};
const PROVIDER_MODELS = IMAGE_PROVIDER_MODELS;

function getRaw(key: string) {
  return (db.prepare("SELECT value FROM settings WHERE key=?").get(key) as { value: string } | undefined)?.value ?? null;
}
function setRaw(key: string, value: string) {
  db.prepare("INSERT INTO settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").run(key, value);
}

export function getImageProvider(): ImageProvider {
  const raw = getRaw(SETTING_PROVIDER_KEY);
  return raw === "gemini" || raw === "openai" || raw === "xai" || raw === "a2e" || raw === "hedra" || raw === "mock" ? raw : "hedra";
}
export function setImageProvider(provider: ImageProvider) { setRaw(SETTING_PROVIDER_KEY, provider); }

export function getImageApiKey(): string {
  const encrypted = getRaw(SETTING_KEY);
  if (encrypted) return decryptSecret(encrypted);
  const provider = getImageProvider();
  if (provider === "openai" && process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  if (provider === "gemini" && process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  if (provider === "xai" && process.env.XAI_API_KEY) return process.env.XAI_API_KEY;
  if (provider === "a2e") return getProviderKey("a2e");
  if (provider === "hedra") return getProviderKey("hedra");
  throw new Error("Image API key is not configured");
}

// Per-provider key lookup for the image-fallback chain in
// lib/campaign-image.ts. getImageApiKey() above only returns the key for
// the currently CONFIGURED provider, which means a fallback call
// (e.g. configured=Hedra, falling through to Gemini) would call
// Gemini with the Hedra key and 401. This resolver takes an explicit
// provider and returns its key from the same sources, throwing when
// the requested provider's key isn't configured so the chain can
// skip it cleanly.
export function getImageApiKeyForProvider(provider: ImageProvider): string {
  if (provider === "openai" && process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  if (provider === "gemini" && process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  if (provider === "xai" && process.env.XAI_API_KEY) return process.env.XAI_API_KEY;
  if (provider === "a2e") return getProviderKey("a2e");
  if (provider === "hedra") return getProviderKey("hedra");
  if (provider === "mock") return "mock";
  throw new Error(`No API key configured for image provider "${provider}"`);
}
export function saveImageApiKey(value: string) { setRaw(SETTING_KEY, encryptSecret(value.trim())); }
export function isImageProviderConfigured(): boolean {
  if (getImageProvider() === "mock") return true;
  try { return Boolean(getImageApiKey()); } catch { return false; }
}
export function getImageModel(): string {
  const allowed = PROVIDER_MODELS[getImageProvider()];
  const raw = getRaw(SETTING_MODEL_KEY);
  return raw && allowed.includes(raw) ? raw : allowed[0];
}
export function setImageModel(model: string) {
  const allowed = PROVIDER_MODELS[getImageProvider()];
  if (!allowed.includes(model)) throw new Error(`Invalid model "${model}" for provider "${getImageProvider()}"`);
  setRaw(SETTING_MODEL_KEY, model);
}
export function listImageProviders() {
  return [
    { id: "hedra", label: "Hedra multi-model image (gpt-image-2, flux2-max, imagen-4, seedream-5, ideogram-v4, recraft-v3)", envVar: "HEDRA_API_KEY", help: "Default image provider. 75+ image models behind one v3 endpoint, ~3.5¢ per generation. Text-to-image and reference-image editing." },
    { id: "gemini", label: "Google Gemini image generation", envVar: "GEMINI_API_KEY", help: "Native multimodal; supports reference-image editing. Best for identity-preserving 4-view turnaround." },
    { id: "a2e", label: "A2E GPT Image (gpt-image-1.5 / gpt-image-2)", envVar: "A2E_API_KEY", help: "Asynchronous upload-reference-then-edit. Routed through A2E's GPT Image endpoint. Best for 4-view turnaround when OpenAI is slow or its gpt-image-1 base64 path is timing out." },
    { id: "openai", label: "OpenAI image generation", envVar: "OPENAI_API_KEY", help: "gpt-image-1 supports reference editing. Higher cost, slower latency." },
    { id: "xai", label: "xAI Grok Imagine", envVar: "XAI_API_KEY", help: "Text-to-image only. Good for generating a fresh reference portrait from a prompt; cannot edit a reference for the 4-view turnaround." },
    { id: "mock", label: "Mock placeholder", envVar: null, help: "Development-only deterministic SVG. Proves the pipeline but is not AI." }
  ] as const;
}
export function listImageModelChoices() { return PROVIDER_MODELS[getImageProvider()]; }
export function listImageModelsFor(provider: ImageProvider) { return PROVIDER_MODELS[provider] ?? []; }
export function isImageProviderId(value: string): value is ImageProvider {
  return value === "gemini" || value === "openai" || value === "xai" || value === "a2e" || value === "hedra" || value === "mock";
}

export class ImageKeyMissingError extends Error {
  constructor() { super("Image API key is not configured"); this.name = "ImageKeyMissingError"; }
}
export class ImageUpstreamError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.name = "ImageUpstreamError"; this.status = status; }
}

const ROTATION_PROMPT_BASE = "Edit the supplied reference portrait into another camera angle of the SAME adult person. Preserve exact facial identity, eye color and shape, skin tone, hairstyle, wardrobe items and colors, body proportions, studio environment, lighting direction, camera distance and lens character. Photorealistic natural skin texture, realistic eyes and teeth, no beauty-filter plastic skin, one person only. ";
const VIEW_PROMPTS: Record<AvatarView, string> = {
  front: ROTATION_PROMPT_BASE + "Camera: canonical straight-on front view at eye level, subject looking into lens.",
  left: ROTATION_PROMPT_BASE + "Camera rotates around the subject to show a left-side three-quarter/profile view. Do not mirror logos, jewelry, or wardrobe details.",
  right: ROTATION_PROMPT_BASE + "Camera rotates around the subject to show a right-side three-quarter/profile view. Do not mirror logos, jewelry, or wardrobe details.",
  back: ROTATION_PROMPT_BASE + "Camera rotates 180 degrees behind the subject, showing the back of hair, shoulders and the exact same outfit."
};

export type GenerateResult = { png: Buffer; model: string; prompt: string };

function resolveReferencePath(referenceImagePath: string) {
  if (referenceImagePath.startsWith("/avatars/")) return path.resolve(process.cwd(), "public", referenceImagePath.slice(1));
  if (referenceImagePath.startsWith("/public/")) return path.resolve(process.cwd(), referenceImagePath.slice(1));
  if (referenceImagePath.startsWith("public/")) return path.resolve(process.cwd(), referenceImagePath);
  if (path.isAbsolute(referenceImagePath)) return referenceImagePath;
  return path.resolve(process.cwd(), referenceImagePath);
}

function mimeFromExtension(pathname: string): "image/png" | "image/jpeg" | "image/webp" | null {
  const lower = pathname.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return null;
}
function sniffImageMime(bytes: Buffer, pathname: string): "image/png" | "image/jpeg" | "image/webp" {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 12 && bytes.subarray(0,4).toString("ascii") === "RIFF" && bytes.subarray(8,12).toString("ascii") === "WEBP") return "image/webp";
  const ext = mimeFromExtension(pathname);
  if (ext) return ext;
  throw new ImageUpstreamError("Reference image must be a PNG, JPEG, or WebP file before canonical turnaround generation.", 400);
}
function uploadFilename(mime: "image/png" | "image/jpeg" | "image/webp") {
  return mime === "image/png" ? "reference.png" : mime === "image/webp" ? "reference.webp" : "reference.jpg";
}

export async function generateView(opts: { avatarId: string; view: AvatarView; referenceImagePath: string; archetype: string; wardrobeStandard: string }): Promise<GenerateResult> {
  const provider = getImageProvider();
  const model = getImageModel();
  const prompt = `${VIEW_PROMPTS[opts.view]}\nArchetype: ${opts.archetype}.\nWardrobe standard: ${opts.wardrobeStandard}.`;
  if (provider === "xai") throw new ImageUpstreamError("xAI Grok Imagine does not support image-to-image editing. Pick A2E, Gemini, or OpenAI for the 4-view turnaround; use xAI for fresh reference portraits only.", 400);
  const referencePath = resolveReferencePath(opts.referenceImagePath);
  if (provider === "a2e") return a2eImageGenerate(referencePath, model, prompt);
  if (provider === "openai") return openaiImageGenerate(referencePath, model, prompt);
  if (provider === "hedra") return hedraImageGenerate(referencePath, model, prompt);
  if (provider === "mock") return mockGenerate(opts, model, prompt);
  return geminiImageGenerate(referencePath, model, prompt);
}

async function geminiImageGenerate(referencePath: string, model: string, prompt: string): Promise<GenerateResult> {
  const key = getImageApiKey();
  const bytes = await fs.readFile(referencePath);
  const mime = sniffImageMime(bytes, referencePath);
  const b64 = bytes.toString("base64");
  const TIMEOUT_MS = 30000;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  let hardTimer: NodeJS.Timeout | undefined;
  const hardTimeout = new Promise<never>((_, reject) => {
    hardTimer = setTimeout(() => reject(new ImageUpstreamError(`Gemini image API hard timeout after ${TIMEOUT_MS + 1500}ms`, 504)), TIMEOUT_MS + 1500);
  });
  try {
    const response = await Promise.race([
      fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", signal: ac.signal,
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ inline_data: { mime_type: mime, data: b64 } }, { text: prompt }] }], generationConfig: { responseModalities: ["IMAGE"], temperature: 0.35 } })
      }),
      hardTimeout
    ]);
    if (!response.ok) throw new ImageUpstreamError(`Gemini image API HTTP ${response.status}: ${(await response.text()).slice(0,300)}`, response.status);
    const json = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ inline_data?: { data?: string } }> } }> };
    const data = json.candidates?.[0]?.content?.parts?.find(p => p.inline_data?.data)?.inline_data?.data;
    if (!data) throw new ImageUpstreamError("Gemini returned no image", 502);
    return { png: Buffer.from(data, "base64"), model, prompt };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw new ImageUpstreamError(`Gemini image API timed out after ${TIMEOUT_MS}ms`, 504);
    throw e;
  } finally {
    clearTimeout(timer);
    if (hardTimer) clearTimeout(hardTimer);
  }
}

async function hedraImageGenerate(referencePath: string | null, model: string, prompt: string): Promise<GenerateResult> {
  // Hedra v3 image generation: submit + poll, return image bytes.
  // Same /v3/models/{model_id} submit + /v3/jobs/{id}/status poll + /v3/jobs/{id} read pattern as the video endpoint.
  // Model id is whatever the user selected in settings (gpt-image-2, flux2-max, imagen-4, seedream-5, etc.)
  //
  // The Hedra v3 catalog doesn't publish a typed per-model schema here, so we keep
  // small per-model allowlists. The default payload is `{ prompt, aspect_ratio }`.
  // Models that need it also get `quality` (gpt-image family) or `resolution` (some
  // others). Sending fields the model rejects (e.g. `resolution` to flux2-max) causes
  // HTTP 400 "Extra inputs are not permitted", so we set the right fields per model.
  const key = getProviderKey("hedra");
  const TIMEOUT_MS = 120000;
  const aspectRatio = "9:16";
  const MODELS_NEEDING_QUALITY = new Set(["gpt-image-2", "gpt-image-1.5"]);
  const MODELS_ACCEPTING_RESOLUTION = new Set([
    "gpt-image-2", "gpt-image-1.5",
    "imagen-4", "nano-banana-pro",
    "ideogram-v4", "recraft-v3", "seedream-5"
  ]);
  const ac = new AbortController();
  const submitTimer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  const input: Record<string, unknown> = { prompt, aspect_ratio: aspectRatio };
  if (MODELS_NEEDING_QUALITY.has(model)) input.quality = "high";
  if (MODELS_ACCEPTING_RESOLUTION.has(model)) input.resolution = "1K";
  // Only attach reference image if a path is supplied AND the model supports it.
  // The text-to-image models (flux2-max, gpt-image-2, imagen-4) accept an optional input image as
  // an "assets" base64 pair; when we have a reference, attach it as the first frame.
  try {
    let submit: Response;
    if (referencePath) {
      const bytes = await fs.readFile(referencePath);
      const mime = sniffImageMime(bytes, referencePath);
      const b64 = bytes.toString("base64");
      submit = await fetch(`https://api.hedra.com/v3/models/${encodeURIComponent(model)}`, {
        method: "POST",
        headers: { "Authorization": `Key ${key}`, "Content-Type": "application/json" },
        cache: "no-store",
        signal: ac.signal,
        body: JSON.stringify({ input: { ...input, input_image: { type: "base64", media_type: mime, data: b64 } } })
      });
    } else {
      submit = await fetch(`https://api.hedra.com/v3/models/${encodeURIComponent(model)}`, {
        method: "POST",
        headers: { "Authorization": `Key ${key}`, "Content-Type": "application/json" },
        cache: "no-store",
        signal: ac.signal,
        body: JSON.stringify({ input })
      });
    }
    if (!submit.ok) throw new ImageUpstreamError(`Hedra image submit HTTP ${submit.status}: ${(await submit.text()).slice(0,300)}`, submit.status);
    const sub = await submit.json() as { job_id?: string; id?: string };
    const jobId = sub.job_id || sub.id;
    if (!jobId) throw new ImageUpstreamError("Hedra image submit returned no job id", 502);

    // Poll until COMPLETED / FAILED
    const pollStart = Date.now();
    let status = "queued";
    while (Date.now() - pollStart < TIMEOUT_MS) {
      await new Promise(r => setTimeout(r, 1500));
      const r = await fetch(`https://api.hedra.com/v3/jobs/${encodeURIComponent(jobId)}/status`, {
        headers: { "Authorization": `Key ${key}` }, cache: "no-store"
      });
      if (!r.ok) throw new ImageUpstreamError(`Hedra image poll HTTP ${r.status}: ${(await r.text()).slice(0,300)}`, r.status);
      const j = await r.json() as { status?: string; state?: string };
      status = (j.status || j.state || "queued").toLowerCase();
      if (status === "completed" || status === "succeeded" || status === "success") break;
      if (status === "failed" || status === "error" || status === "cancelled") {
        throw new ImageUpstreamError(`Hedra image job ${jobId} ${status}`, 502);
      }
    }
    if (status !== "completed" && status !== "succeeded" && status !== "success") {
      throw new ImageUpstreamError(`Hedra image job ${jobId} timed out after ${TIMEOUT_MS}ms (last status: ${status})`, 504);
    }

    // Read result
    const r = await fetch(`https://api.hedra.com/v3/jobs/${encodeURIComponent(jobId)}`, {
      headers: { "Authorization": `Key ${key}` }, cache: "no-store"
    });
    if (!r.ok) throw new ImageUpstreamError(`Hedra image result HTTP ${r.status}: ${(await r.text()).slice(0,300)}`, r.status);
    const j = await r.json() as { outputs?: Array<{ url?: string; b64?: string; data?: string }>; data?: Array<{ url?: string; b64?: string; data?: string }> };
    const outputs = j.outputs || j.data || [];
    const out = outputs[0];
    if (!out) throw new ImageUpstreamError("Hedra returned no image output", 502);
    if (out.b64 || out.data) {
      return { png: Buffer.from((out.b64 || out.data) as string, "base64"), model, prompt };
    }
    if (out.url) {
      const dl = await fetch(out.url, { signal: ac.signal, cache: "no-store" });
      if (!dl.ok) throw new ImageUpstreamError(`Hedra image download HTTP ${dl.status}`, dl.status);
      return { png: Buffer.from(await dl.arrayBuffer()), model, prompt };
    }
    throw new ImageUpstreamError("Hedra output had no url or b64 data", 502);
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw new ImageUpstreamError(`Hedra image API timed out after ${TIMEOUT_MS}ms`, 504);
    throw e;
  } finally {
    clearTimeout(submitTimer);
  }
}

async function openaiImageGenerate(referencePath: string, model: string, prompt: string): Promise<GenerateResult> {
  const key = getImageApiKey();
  // gpt-image-1 with reference editing routinely takes 60-90s. 45s was too short.
  const TIMEOUT_MS = 120000;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    let response: Response;
    if (model === "dall-e-3") {
      response = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({ model, prompt, n: 1, size: "1024x1792", response_format: "b64_json" })
      });
    } else {
      const bytes = await fs.readFile(referencePath);
      const mime = sniffImageMime(bytes, referencePath);
      const form = new FormData();
      form.append("model", model);
      form.append("image", new Blob([bytes], { type: mime }), uploadFilename(mime));
      form.append("prompt", prompt);
      form.append("n", "1");
      form.append("size", "1024x1536");
      form.append("input_fidelity", "high");
      response = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form, signal: ac.signal });
    }
    if (!response.ok) throw new ImageUpstreamError(`OpenAI image API HTTP ${response.status}: ${(await response.text()).slice(0,300)}`, response.status);
    const json = await response.json() as { data?: Array<{ b64_json?: string }> };
    const data = json.data?.[0]?.b64_json;
    if (!data) throw new ImageUpstreamError("OpenAI returned no image", 502);
    return { png: Buffer.from(data, "base64"), model, prompt };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw new ImageUpstreamError(`OpenAI image API timed out after ${TIMEOUT_MS}ms`, 504);
    throw e;
  } finally { clearTimeout(timer); }
}

async function a2eImageGenerate(referencePath: string, model: string, prompt: string): Promise<GenerateResult> {
  return generateA2eGptImage({ prompt, model, referencePath, aspectRatio: "2:3" });
}

export async function generateA2eGptImage(input: {
  prompt: string;
  model?: string;
  referencePath?: string | null;
  aspectRatio?: string;
}): Promise<GenerateResult> {
  const TIMEOUT_MS = 180000;
  const POLL_MS = 2500;
  const model = input.model === "gpt-image-2" ? "gpt-image-2" : (input.model || "gpt-image-1.5");
  const prompt = input.prompt;
  const aspectRatio = input.aspectRatio || "9:16";
  let inputImages: string[] | undefined;
  if (input.referencePath) {
    const bytes = await fs.readFile(input.referencePath);
    const mime = sniffImageMime(bytes, input.referencePath);
    inputImages = [await uploadA2eBase64(bytes.toString("base64"), mime, "video-engine/campaign-stills")];
  }
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const startBody: Record<string, unknown> = {
      name: `campaign-still-${Date.now()}`,
      prompt,
      model,
      aspect_ratio: aspectRatio
    };
    if (inputImages?.length) startBody.input_images = inputImages;
    if (model === "gpt-image-2") startBody.resolution = "1K";
    else startBody.quality = "high";
    const startRes = await fetch("https://video.a2e.ai/api/v1/userGptImage/start", {
      method: "POST",
      headers: { Authorization: `Bearer ${getImageApiKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify(startBody),
      cache: "no-store",
      signal: ac.signal
    });
    if (!startRes.ok) throw new ImageUpstreamError(`A2E GPT image start HTTP ${startRes.status}: ${(await startRes.text()).slice(0, 300)}`, startRes.status);
    const startJson = await startRes.json() as { code?: number; msg?: string; err_message?: string; error?: string; data?: Array<{ _id?: string; current_status?: string; image_urls?: string[]; image_url?: string; url_download?: string; fail_reason?: string; failed_message?: string }> | { _id?: string; current_status?: string; image_urls?: string[]; image_url?: string; url_download?: string; fail_reason?: string; failed_message?: string } };
    if (startJson.code && startJson.code !== 0) throw new ImageUpstreamError(`A2E GPT image start failed: ${startJson.err_message || startJson.msg || startJson.error || startJson.code}`, 502);
    const records = Array.isArray(startJson.data) ? startJson.data : startJson.data ? [startJson.data] : [];
    const first = records[0];
    if (!first?._id) throw new ImageUpstreamError(`A2E GPT image start did not return a task id (code=${startJson.code}, error=${startJson.error ?? "?"})`, 502);
    const taskId = first._id;
    const pickUrl = (row: { image_urls?: string[]; image_url?: string; url_download?: string; url_show?: string } | undefined) =>
      row?.image_urls?.[0] || (row?.image_url && row.image_url.trim()) || (row?.url_download && row.url_download.trim()) || (row as { url_show?: string } | undefined)?.url_show || "";
    const failText = (row: { current_status?: string; fail_reason?: string; failed_message?: string } | undefined) =>
      `${row?.current_status || "failed"} (${row?.failed_message || row?.fail_reason || "no reason"})`;
    if (first.current_status && /fail|error|nfsw|nsfw/i.test(first.current_status)) {
      throw new ImageUpstreamError(`A2E GPT image start returned failure status: ${failText(first)}`, 502);
    }
    const immediate = pickUrl(first);
    if (immediate) return await downloadPngFromUrl(immediate, model, prompt, ac.signal);
    const deadline = Date.now() + TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (ac.signal.aborted) break;
      await new Promise<void>((resolve) => setTimeout(resolve, POLL_MS));
      const detailRes = await fetch(`https://video.a2e.ai/api/v1/userGptImage/detail/${encodeURIComponent(taskId)}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${getImageApiKey()}`, "Content-Type": "application/json" },
        cache: "no-store",
        signal: ac.signal
      });
      if (!detailRes.ok) continue;
      const detail = await detailRes.json() as { data?: { _id?: string; current_status?: string; image_urls?: string[]; image_url?: string; url_download?: string; url_show?: string; fail_reason?: string; failed_message?: string } };
      const status = (detail.data?.current_status ?? "").toLowerCase();
      const url = pickUrl(detail.data);
      if (url) return await downloadPngFromUrl(url, model, prompt, ac.signal);
      if (status && /fail|error|nsfw|nfsw/.test(status)) {
        throw new ImageUpstreamError(`A2E GPT image task failed: ${failText(detail.data)}`, 502);
      }
    }
    throw new ImageUpstreamError(`A2E GPT image task did not complete within ${TIMEOUT_MS}ms`, 504);
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw new ImageUpstreamError(`A2E GPT image API timed out after ${TIMEOUT_MS}ms`, 504);
    throw e;
  } finally { clearTimeout(timer); }
}

async function downloadPngFromUrl(url: string, model: string, prompt: string, signal: AbortSignal): Promise<GenerateResult> {
  const dl = await fetch(url, { signal });
  if (!dl.ok) throw new ImageUpstreamError(`A2E image download HTTP ${dl.status}`, dl.status);
  const bytes = Buffer.from(await dl.arrayBuffer());
  try {
    // A2E may return JPEG or WebP bytes even when the task URL has no useful
    // extension. Normalize every hosted result to a real PNG because avatar
    // views and campaign stills persist this buffer with image/png metadata.
    const sharp = (await import("sharp")).default;
    return { png: await sharp(bytes).png().toBuffer(), model, prompt };
  } catch {
    throw new ImageUpstreamError("A2E returned an unreadable image payload", 502);
  }
}

async function mockGenerate(opts: { avatarId: string; view: AvatarView }, model: string, prompt: string): Promise<GenerateResult> {
  const sharp = (await import("sharp")).default;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1536"><rect width="100%" height="100%" fill="#6E56CF"/><text x="512" y="720" text-anchor="middle" font-family="sans-serif" font-size="62" fill="white">${opts.avatarId}</text><text x="512" y="820" text-anchor="middle" font-family="sans-serif" font-size="42" fill="white">${opts.view.toUpperCase()} MOCK</text></svg>`;
  return { png: await sharp(Buffer.from(svg)).png().toBuffer(), model, prompt };
}

export async function generateReferencePortraitFromPrompt(prompt: string): Promise<{ png: Buffer; model: string }> {
  const key = process.env.XAI_API_KEY;
  if (!key) throw new ImageKeyMissingError();
  const model = getImageModel().startsWith("grok-") ? getImageModel() : "grok-imagine-image";
  const ac = new AbortController(); const timer = setTimeout(() => ac.abort(), 30000);
  try {
    const r = await fetch("https://api.x.ai/v1/images/generations", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      signal: ac.signal,
      body: JSON.stringify({ model, prompt, n: 1 })
    });
    if (!r.ok) throw new ImageUpstreamError(`xAI image API HTTP ${r.status}: ${(await r.text()).slice(0,300)}`, r.status);
    const json = await r.json() as { data?: Array<{ url?: string }> };
    const url = json.data?.[0]?.url;
    if (!url) throw new ImageUpstreamError("xAI returned no image URL", 502);
    const dl = await fetch(url, { signal: ac.signal });
    if (!dl.ok) throw new ImageUpstreamError(`xAI image download HTTP ${dl.status}`, dl.status);
    const ab = await dl.arrayBuffer();
    return { png: Buffer.from(ab), model };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw new ImageUpstreamError("xAI image API timed out after 30000ms", 504);
    throw e;
  } finally { clearTimeout(timer); }
}

function patchView(avatarId: string, view: AvatarView, patch: Record<string, unknown>) {
  const entries = Object.entries(patch).filter(([,v]) => v !== undefined);
  if (!entries.length) return;
  const values = entries.map(([,v]) => v); values.push(avatarId, view);
  db.prepare(`UPDATE avatar_views SET ${entries.map(([k]) => `${k}=?`).join(",")},updated_at=CURRENT_TIMESTAMP WHERE avatar_id=? AND view=?`).run(...values);
}
function patchAvatar(avatarId: string, patch: Record<string, unknown>) {
  const entries = Object.entries(patch).filter(([,v]) => v !== undefined);
  if (!entries.length) return;
  const values = entries.map(([,v]) => v); values.push(avatarId);
  db.prepare(`UPDATE avatars SET ${entries.map(([k]) => `${k}=?`).join(",")},updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(...values);
}
async function saveView(avatarId: string, view: AvatarView, png: Buffer) {
  const dir = path.resolve(process.cwd(), "public", "avatars", avatarId);
  await fs.mkdir(dir, { recursive: true });
  const absolute = path.join(dir, `${view}.png`);
  await fs.writeFile(absolute, png);
  return `/avatars/${avatarId}/${view}.png`;
}

export type StartTurnaroundResult = { started: AvatarView[]; skipped: AvatarView[]; reason?: string };
export async function startTurnaround(avatarId: string, opts: { views?: AvatarView[] } = {}): Promise<StartTurnaroundResult> {
  const wanted = opts.views?.length ? opts.views : VIEWS;
  const avatar = db.prepare("SELECT id,reference_image_path,archetype,wardrobe_standard FROM avatars WHERE id=?").get(avatarId) as { id: string; reference_image_path: string | null; archetype: string; wardrobe_standard: string } | undefined;
  if (!avatar) throw new Error("Avatar not found");
  if (!avatar.reference_image_path) return { started: [], skipped: wanted, reason: "Upload or generate a reference identity photo first." };
  try {
    const referencePath = resolveReferencePath(avatar.reference_image_path);
    sniffImageMime(await fs.readFile(referencePath), referencePath);
  } catch (e) {
    return { started: [], skipped: wanted, reason: e instanceof Error ? e.message : String(e) };
  }
  patchAvatar(avatarId, { turnaround_status: "generating", turnaround_started_at: new Date().toISOString(), turnaround_error: null });
  for (const v of wanted) patchView(avatarId, v, { generation_status: "generating", generation_error: null, generation_started_at: new Date().toISOString() });
  setImmediate(() => { runTurnaround(avatarId, wanted).catch((e) => console.error("turnaround fatal", avatarId, e)); });
  return { started: wanted, skipped: [] };
}

async function runOneView(avatarId: string, v: AvatarView) {
  const avatar = db.prepare("SELECT id,reference_image_path,archetype,wardrobe_standard FROM avatars WHERE id=?").get(avatarId) as { id: string; reference_image_path: string; archetype: string; wardrobe_standard: string };
  const startedAt = new Date();
  try {
    const result = await generateView({ avatarId, view: v, referenceImagePath: avatar.reference_image_path, archetype: avatar.archetype, wardrobeStandard: avatar.wardrobe_standard });
    const filePath = await saveView(avatarId, v, result.png);
    const finishedAt = new Date().toISOString();
    patchView(avatarId, v, { file_path: filePath, status: "ready", generation_status: "ready", generation_error: null, generation_model: result.model, generation_prompt: result.prompt, generation_finished_at: finishedAt });
    db.prepare("INSERT INTO avatar_generations(id,avatar_id,view,model,prompt,status,latency_ms,started_at,finished_at) VALUES(?,?,?,?,?,?,?,?,?)").run(crypto.randomUUID(), avatarId, v, result.model, result.prompt, "ready", Date.now() - startedAt.getTime(), startedAt.toISOString(), finishedAt);
    return null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const finishedAt = new Date().toISOString();
    patchView(avatarId, v, { generation_status: "failed", generation_error: msg, generation_finished_at: finishedAt });
    db.prepare("INSERT INTO avatar_generations(id,avatar_id,view,model,prompt,status,error,started_at,finished_at) VALUES(?,?,?,?,?,?,?,?,?)").run(crypto.randomUUID(), avatarId, v, getImageModel(), "", "failed", msg, startedAt.toISOString(), finishedAt);
    return `${v}: ${msg}`;
  }
}

async function runTurnaround(avatarId: string, views: AvatarView[]) {
  const allErrors: string[] = [];
  // Two concurrent edits keeps latency bounded without hammering paid provider limits.
  for (let i = 0; i < views.length; i += 2) {
    const errors = await Promise.all(views.slice(i, i + 2).map(v => runOneView(avatarId, v)));
    allErrors.push(...errors.filter((x): x is string => Boolean(x)));
  }
  const finishedAt = new Date().toISOString();
  const finalStatus = allErrors.length === views.length ? "failed" : allErrors.length ? "incomplete" : "ready";
  patchAvatar(avatarId, { turnaround_status: finalStatus, turnaround_finished_at: finishedAt, turnaround_error: allErrors.length === views.length ? allErrors.join(" | ") : null });
}

export async function regenerateView(avatarId: string, view: AvatarView): Promise<{ ok: boolean; reason?: string }> {
  const avatar = db.prepare("SELECT id,reference_image_path,archetype,wardrobe_standard FROM avatars WHERE id=?").get(avatarId) as { id: string; reference_image_path: string; archetype: string; wardrobe_standard: string } | undefined;
  if (!avatar) return { ok: false, reason: "Avatar not found" };
  if (!avatar.reference_image_path) return { ok: false, reason: "Reference image missing" };
  try {
    const referencePath = resolveReferencePath(avatar.reference_image_path);
    sniffImageMime(await fs.readFile(referencePath), referencePath);
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
  patchView(avatarId, view, { generation_status: "generating", generation_error: null, generation_started_at: new Date().toISOString() });
  setImmediate(() => { runRegenerate(avatarId, view, avatar).catch(e => console.error("regen fatal", e)); });
  return { ok: true };
}
async function runRegenerate(avatarId: string, view: AvatarView, avatar: { reference_image_path: string; archetype: string; wardrobe_standard: string }) {
  await runOneView(avatarId, view);
}
