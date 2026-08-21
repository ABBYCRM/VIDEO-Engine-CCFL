import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { VIEWS, type AvatarView } from "@/lib/avatars";
import { editAvatarImage } from "@/lib/nvidia/image";
import { getNvidiaApiKey } from "@/lib/nvidia/client";

export type ImageProvider = "nvidia" | "gemini" | "openai" | "mock";
const SETTING_KEY = "image_api_key";
const SETTING_MODEL_KEY = "image_model";
const SETTING_PROVIDER_KEY = "image_provider";
const PROVIDER_MODELS: Record<ImageProvider, string[]> = {
  nvidia: ["black-forest-labs/flux.2-klein-4b"],
  gemini: ["gemini-2.0-flash-exp", "gemini-2.5-flash-image-preview", "gemini-2.5-flash"],
  openai: ["gpt-image-1", "dall-e-3"],
  mock: ["mock-stable-diffusion-1"]
};

function getRaw(key: string) {
  return (db.prepare("SELECT value FROM settings WHERE key=?").get(key) as { value: string } | undefined)?.value;
}
function setRaw(key: string, value: string) {
  db.prepare("INSERT INTO settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").run(key, value);
}

export function getImageProvider(): ImageProvider {
  const raw = getRaw(SETTING_PROVIDER_KEY);
  return raw === "nvidia" || raw === "gemini" || raw === "openai" || raw === "mock" ? raw : "nvidia";
}
export function setImageProvider(provider: ImageProvider) { setRaw(SETTING_PROVIDER_KEY, provider); }

export function getImageApiKey(): string {
  const provider = getImageProvider();
  if (provider === "nvidia") return getNvidiaApiKey();
  const encrypted = getRaw(SETTING_KEY);
  if (encrypted) return decryptSecret(encrypted);
  if (provider === "openai" && process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  if (provider === "gemini" && process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  throw new Error("Image API key is not configured");
}
export function saveImageApiKey(value: string) {
  if (getImageProvider() === "nvidia") setRaw("nvidia_api_key", encryptSecret(value.trim()));
  else setRaw(SETTING_KEY, encryptSecret(value.trim()));
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
    { id: "nvidia", label: "NVIDIA FLUX.2 Klein 4B", envVar: "NVIDIA_API_KEY", help: "Preferred. Uses FLUX.2 image editing to preserve the reference identity across the four turnaround views." },
    { id: "gemini", label: "Google Gemini image generation", envVar: "GEMINI_API_KEY", help: "Reference-image generation fallback." },
    { id: "openai", label: "OpenAI image generation", envVar: "OPENAI_API_KEY", help: "Optional fallback; gpt-image-1 supports reference editing." },
    { id: "mock", label: "Mock placeholder", envVar: null, help: "Development-only deterministic placeholders." }
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
  const referencePath = resolveReferencePath(opts.referenceImagePath);
  if (provider === "nvidia") {
    const bytes = await fs.readFile(referencePath);
    const result = await editAvatarImage({ prompt, imageBase64: bytes.toString("base64"), imageMimeType: mimeFor(referencePath) });
    return { png: Buffer.from(result.base64, "base64"), model: result.model, prompt };
  }
  if (provider === "openai") return openaiImageGenerate(referencePath, model, prompt);
  if (provider === "mock") return mockGenerate(opts, model, prompt);
  return geminiImageGenerate(referencePath, model, prompt);
}

async function geminiImageGenerate(referencePath: string, model: string, prompt: string): Promise<GenerateResult> {
  const key = getImageApiKey();
  const b64 = (await fs.readFile(referencePath)).toString("base64");
  const ac = new AbortController(); const timer = setTimeout(() => ac.abort(), 90000);
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
  const ac = new AbortController(); const timer = setTimeout(() => ac.abort(), 90000);
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
  if (!isImageProviderConfigured()) throw new ImageKeyMissingError();
  const model = getImageModel(); const now = new Date().toISOString();
  for (const view of wanted) {
    const prompt = `${VIEW_PROMPTS[view]}\nArchetype: ${avatar.archetype}.\nWardrobe standard: ${avatar.wardrobe_standard}.`;
    db.prepare("INSERT INTO avatar_generations(id,avatar_id,view,model,prompt,reference_image_path,status) VALUES(?,?,?,?,?,?,'generating')").run(crypto.randomUUID(), avatarId, view, model, prompt, avatar.reference_image_path);
    patchView(avatarId, view, { generation_status: "generating", generation_model: model, generation_prompt: prompt, generation_error: null, generation_started_at: now, generation_finished_at: null });
  }
  patchAvatar(avatarId, { turnaround_status: "generating", turnaround_model: model, turnaround_started_at: now, turnaround_finished_at: null, turnaround_error: null });
  void runGenerations(avatarId, wanted);
  return { started: [...wanted], skipped: [] };
}

async function runGenerations(avatarId: string, views: AvatarView[]) {
  const avatar = db.prepare("SELECT reference_image_path,archetype,wardrobe_standard FROM avatars WHERE id=?").get(avatarId) as { reference_image_path: string | null; archetype: string; wardrobe_standard: string } | undefined;
  if (!avatar?.reference_image_path) return;
  let failures = 0;
  for (const view of views) {
    try {
      const result = await generateView({ avatarId, view, referenceImagePath: avatar.reference_image_path, archetype: avatar.archetype, wardrobeStandard: avatar.wardrobe_standard });
      const publicPath = await saveView(avatarId, view, result.png);
      patchView(avatarId, view, { file_path: publicPath, status: "ready", generation_status: "ready", generation_model: result.model, generation_prompt: result.prompt, generation_error: null, generation_finished_at: new Date().toISOString() });
      db.prepare("UPDATE avatar_generations SET result_path=?,status='ready',finished_at=CURRENT_TIMESTAMP WHERE avatar_id=? AND view=? AND status='generating'").run(publicPath, avatarId, view);
    } catch (e) {
      failures++;
      const message = e instanceof Error ? e.message : String(e);
      patchView(avatarId, view, { generation_status: "failed", generation_error: message, generation_finished_at: new Date().toISOString() });
      db.prepare("UPDATE avatar_generations SET status='failed',error=?,finished_at=CURRENT_TIMESTAMP WHERE avatar_id=? AND view=? AND status='generating'").run(message, avatarId, view);
    }
  }
  const ready = (db.prepare("SELECT COUNT(*) n FROM avatar_views WHERE avatar_id=? AND status='ready'").get(avatarId) as { n: number }).n;
  const status = ready === VIEWS.length ? "ready" : ready > 0 ? "incomplete" : failures ? "failed" : "draft";
  patchAvatar(avatarId, { turnaround_status: status, turnaround_finished_at: new Date().toISOString(), turnaround_error: failures ? `${failures} view generation${failures === 1 ? "" : "s"} failed` : null });
  if (ready === VIEWS.length) db.prepare("UPDATE avatars SET status='ready',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(avatarId);
}
