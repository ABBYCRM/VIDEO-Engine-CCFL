import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { VIEWS, type AvatarView } from "@/lib/avatars";

// Image providers for the 4-view avatar turnaround.
//
// 2026-08-22: removed NVIDIA FLUX.2 Klein 4B. The hosted endpoint at
// https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.2-klein-4b is
// the Preview API which only accepts `example_id` placeholders for the
// reference image — real base64 inputs are rejected with
//   "Expected: example_id, got: base64"
// The production NIM is self-hosted (NGC container on your own GPU) and
// not accessible via API. Operator can re-add it later by deploying
// their own FLUX NIM and pointing `lib/nvidia/image.ts` at it.
//
// 2026-08-22: added xAI Grok Imagine for the fresh-portrait (no reference)
// path. xAI /v1/images/edits returns HTTP 422 for image-to-image edits, so
// it can't do the identity-preserving 4-view turnaround from a reference
// photo. It IS usable for the "generate reference from a prompt" flow on
// /avatars when the operator wants a brand-new identity.

export type ImageProvider = "gemini" | "openai" | "xai" | "mock";
const SETTING_KEY = "image_api_key";
const SETTING_MODEL_KEY = "image_model";
const SETTING_PROVIDER_KEY = "image_provider";
const PROVIDER_MODELS: Record<ImageProvider, string[]> = {
  gemini: [
    "gemini-2.5-flash-image",
    "gemini-3.1-flash-image-preview",
    "gemini-3.1-flash-image",
    "gemini-3.1-flash-lite-image"
  ],
  openai: ["gpt-image-1", "dall-e-3"],
  xai: ["grok-imagine-image", "grok-imagine-image-2.0", "grok-imagine-image-quality"],
  mock: ["mock-stable-diffusion-1"]
};

function getRaw(key: string) {
  return (db.prepare("SELECT value FROM settings WHERE key=?").get(key) as { value: string } | undefined)?.value ?? null;
}
function setRaw(key: string, value: string) {
  db.prepare("INSERT INTO settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").run(key, value);
}

export function getImageProvider(): ImageProvider {
  const raw = getRaw(SETTING_PROVIDER_KEY);
  return raw === "gemini" || raw === "openai" || raw === "xai" || raw === "mock" ? raw : "gemini";
}
export function setImageProvider(provider: ImageProvider) { setRaw(SETTING_PROVIDER_KEY, provider); }

export function getImageApiKey(): string {
  const encrypted = getRaw(SETTING_KEY);
  if (encrypted) return decryptSecret(encrypted);
  const provider = getImageProvider();
  if (provider === "openai" && process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  if (provider === "gemini" && process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  if (provider === "xai" && process.env.XAI_API_KEY) return process.env.XAI_API_KEY;
  throw new Error("Image API key is not configured");
}
export function saveImageApiKey(value: string) {
  setRaw(SETTING_KEY, encryptSecret(value.trim()));
}
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
    { id: "gemini", label: "Google Gemini image generation", envVar: "GEMINI_API_KEY", help: "Native multimodal; supports reference-image editing. Best for identity-preserving 4-view turnaround." },
    { id: "openai", label: "OpenAI image generation", envVar: "OPENAI_API_KEY", help: "gpt-image-1 supports reference editing. Higher cost, slower latency." },
    { id: "xai",   label: "xAI Grok Imagine", envVar: "XAI_API_KEY", help: "Text-to-image only. Good for generating a fresh reference portrait from a prompt; cannot edit a reference for the 4-view turnaround." },
    { id: "mock",  label: "Mock placeholder", envVar: null, help: "Development-only deterministic SVG. Proves the pipeline but is not AI." }
  ] as const;
}
export function listImageModelChoices() { return PROVIDER_MODELS[getImageProvider()]; }

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
function mimeFor(pathname: string) {
  const lower = pathname.toLowerCase();
  return lower.endsWith(".png") ? "image/png" : lower.endsWith(".webp") ? "image/webp" : "image/jpeg";
}

export async function generateView(opts: { avatarId: string; view: AvatarView; referenceImagePath: string; archetype: string; wardrobeStandard: string }): Promise<GenerateResult> {
  const provider = getImageProvider();
  const model = getImageModel();
  const prompt = `${VIEW_PROMPTS[opts.view]}\nArchetype: ${opts.archetype}.\nWardrobe standard: ${opts.wardrobeStandard}.`;
  if (provider === "xai") {
    // xAI /v1/images/edits returns 422 for image-to-image. The 4-view
    // turnaround fundamentally needs a reference image, so xAI can't do
    // this. Throw a clear error so the operator sees it.
    throw new ImageUpstreamError("xAI Grok Imagine does not support image-to-image editing. Pick Gemini or OpenAI for the 4-view turnaround; use xAI for fresh reference portraits only.", 400);
  }
  const referencePath = resolveReferencePath(opts.referenceImagePath);
  if (provider === "openai") return openaiImageGenerate(referencePath, model, prompt);
  if (provider === "mock") return mockGenerate(opts, model, prompt);
  return geminiImageGenerate(referencePath, model, prompt);
}

async function geminiImageGenerate(referencePath: string, model: string, prompt: string): Promise<GenerateResult> {
  const key = getImageApiKey();
  const b64 = (await fs.readFile(referencePath)).toString("base64");
  const ac = new AbortController(); const timer = setTimeout(() => ac.abort(), 30000);
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", signal: ac.signal,
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ inline_data: { mime_type: mimeFor(referencePath), data: b64 } }, { text: prompt }] }], generationConfig: { responseModalities: ["IMAGE"], temperature: 0.35 } })
    });
    if (!response.ok) throw new ImageUpstreamError(`Gemini image API HTTP ${response.status}: ${(await response.text()).slice(0,300)}`, response.status);
    const json = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ inline_data?: { data?: string } }> } }> };
    const data = json.candidates?.[0]?.content?.parts?.find(p => p.inline_data?.data)?.inline_data?.data;
    if (!data) throw new ImageUpstreamError("Gemini returned no image", 502);
    return { png: Buffer.from(data, "base64"), model, prompt };
  } finally { clearTimeout(timer); }
}

async function openaiImageGenerate(referencePath: string, model: string, prompt: string): Promise<GenerateResult> {
  const key = getImageApiKey();
  const ac = new AbortController(); const timer = setTimeout(() => ac.abort(), 30000);
  try {
    let response: Response;
    if (model === "dall-e-3") {
      response = await fetch("https://api.openai.com/v1/images/generations", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, signal: ac.signal, body: JSON.stringify({ model, prompt, n: 1, size: "1024x1792", response_format: "b64_json" }) });
    } else {
      const bytes = await fs.readFile(referencePath);
      const form = new FormData(); form.append("model", model); form.append("image", new Blob([bytes]), "reference.png"); form.append("prompt", prompt); form.append("n", "1"); form.append("size", "1024x1536"); form.append("input_fidelity", "high");
      response = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form, signal: ac.signal });
    }
    if (!response.ok) throw new ImageUpstreamError(`OpenAI image API HTTP ${response.status}: ${(await response.text()).slice(0,300)}`, response.status);
    const json = await response.json() as { data?: Array<{ b64_json?: string }> };
    const data = json.data?.[0]?.b64_json;
    if (!data) throw new ImageUpstreamError("OpenAI returned no image", 502);
    return { png: Buffer.from(data, "base64"), model, prompt };
  } finally { clearTimeout(timer); }
}

async function mockGenerate(opts: { avatarId: string; view: AvatarView }, model: string, prompt: string): Promise<GenerateResult> {
  const sharp = (await import("sharp")).default;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1536"><rect width="100%" height="100%" fill="#6E56CF"/><text x="512" y="720" text-anchor="middle" font-family="sans-serif" font-size="62" fill="white">${opts.avatarId}</text><text x="512" y="820" text-anchor="middle" font-family="sans-serif" font-size="42" fill="white">${opts.view.toUpperCase()} MOCK</text></svg>`;
  return { png: await sharp(Buffer.from(svg)).png().toBuffer(), model, prompt };
}

// xAI text-to-image: used by the "Generate reference portrait from a prompt"
// flow on /avatars. NOT used for the 4-view turnaround (xAI has no image
// editing endpoint). Returns a PNG buffer.
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
  patchAvatar(avatarId, { turnaround_status: "generating", turnaround_started_at: new Date().toISOString(), turnaround_error: null });
  for (const v of wanted) {
    patchView(avatarId, v, { generation_status: "generating", generation_error: null, generation_started_at: new Date().toISOString() });
  }
  setImmediate(() => { runTurnaround(avatarId, wanted).catch((e) => console.error("turnaround fatal", avatarId, e)); });
  return { started: wanted, skipped: [] };
}
async function runTurnaround(avatarId: string, views: AvatarView[]) {
  const finishedAt = new Date().toISOString();
  const allErrors: string[] = [];
  for (const v of views) {
    try {
      const avatar = db.prepare("SELECT id,reference_image_path,archetype,wardrobe_standard FROM avatars WHERE id=?").get(avatarId) as { id: string; reference_image_path: string; archetype: string; wardrobe_standard: string };
      const t0 = Date.now();
      const result = await generateView({ avatarId, view: v, referenceImagePath: avatar.reference_image_path, archetype: avatar.archetype, wardrobeStandard: avatar.wardrobe_standard });
      const filePath = await saveView(avatarId, v, result.png);
      const latency = Date.now() - t0;
      patchView(avatarId, v, { file_path: filePath, status: "ready", generation_status: "ready", generation_model: result.model, generation_prompt: result.prompt, generation_finished_at: finishedAt });
      db.prepare("INSERT INTO avatar_generations(id,avatar_id,view,model,prompt,status,latency_ms,started_at,finished_at) VALUES(?,?,?,?,?,?,?,?,?)").run(crypto.randomUUID(), avatarId, v, result.model, result.prompt, "ready", latency, new Date(t0).toISOString(), finishedAt);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      allErrors.push(`${v}: ${msg}`);
      patchView(avatarId, v, { generation_status: "failed", generation_error: msg, generation_finished_at: finishedAt });
      db.prepare("INSERT INTO avatar_generations(id,avatar_id,view,model,prompt,status,error_message,started_at,finished_at) VALUES(?,?,?,?,?,?,?,?,?)").run(crypto.randomUUID(), avatarId, v, getImageModel(), null, "failed", msg, new Date().toISOString(), finishedAt);
    }
  }
  const finalStatus = allErrors.length === views.length ? "failed" : allErrors.length ? "incomplete" : "ready";
  patchAvatar(avatarId, { turnaround_status: finalStatus, turnaround_finished_at: finishedAt, turnaround_error: allErrors.length === views.length ? allErrors.join(" | ") : null });
}
export async function regenerateView(avatarId: string, view: AvatarView): Promise<{ ok: boolean; reason?: string }> {
  const avatar = db.prepare("SELECT id,reference_image_path,archetype,wardrobe_standard FROM avatars WHERE id=?").get(avatarId) as { id: string; reference_image_path: string; archetype: string; wardrobe_standard: string } | undefined;
  if (!avatar) return { ok: false, reason: "Avatar not found" };
  if (!avatar.reference_image_path) return { ok: false, reason: "Reference image missing" };
  patchView(avatarId, view, { generation_status: "generating", generation_error: null, generation_started_at: new Date().toISOString() });
  setImmediate(() => { runRegenerate(avatarId, view, avatar).catch(e => console.error("regen fatal", e)); });
  return { ok: true };
}
async function runRegenerate(avatarId: string, view: AvatarView, avatar: { reference_image_path: string; archetype: string; wardrobe_standard: string }) {
  const finishedAt = new Date().toISOString();
  try {
    const t0 = Date.now();
    const result = await generateView({ avatarId, view, referenceImagePath: avatar.reference_image_path, archetype: avatar.archetype, wardrobeStandard: avatar.wardrobe_standard });
    const filePath = await saveView(avatarId, view, result.png);
    const latency = Date.now() - t0;
    patchView(avatarId, view, { file_path: filePath, status: "ready", generation_status: "ready", generation_model: result.model, generation_prompt: result.prompt, generation_finished_at: finishedAt });
    db.prepare("INSERT INTO avatar_generations(id,avatar_id,view,model,prompt,status,latency_ms,started_at,finished_at) VALUES(?,?,?,?,?,?,?,?,?)").run(crypto.randomUUID(), avatarId, view, result.model, result.prompt, "ready", latency, new Date(t0).toISOString(), finishedAt);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    patchView(avatarId, view, { generation_status: "failed", generation_error: msg, generation_finished_at: finishedAt });
    db.prepare("INSERT INTO avatar_generations(id,avatar_id,view,model,prompt,status,error_message,started_at,finished_at) VALUES(?,?,?,?,?,?,?,?,?)").run(crypto.randomUUID(), avatarId, view, getImageModel(), null, "failed", msg, new Date().toISOString(), finishedAt);
  }
}
