// Avatar 4-view turnaround generator.
//
// Operator's flow:
//   1. Upload one reference identity photo (the canonical portrait).
//   2. Hit "Generate" on any view (or "Generate all 4") -> we call the
//      image model with the reference image + a rotation prompt that
//      locks identity, wardrobe, environment, and lighting.
//   3. The generated PNG is saved to public/avatars/<id>/<view>.png,
//      the avatar_views row flips to "ready" (file_path set), and the
//      avatar_generations audit row is recorded.
//
// The shape of the call is identical regardless of which model the
// operator configures; the adapter below swaps by name.

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { VIEWS, type AvatarView } from "@/lib/avatars";

const SETTING_KEY = "image_api_key";
const SETTING_MODEL_KEY = "image_model";
const SETTING_PROVIDER_KEY = "image_provider"; // 'gemini' | 'openai' | 'mock'

// Default model choices per provider. Validated server-side.
const PROVIDER_MODELS: Record<string, string[]> = {
  gemini: ["gemini-2.0-flash-exp", "gemini-2.5-flash-image-preview", "gemini-2.5-flash"],
  openai: ["gpt-image-1", "dall-e-3"],
  mock:  ["mock-stable-diffusion-1"]
};

export function isImageProviderConfigured(): boolean {
  const provider = getImageProvider();
  if (provider === "mock") return true;
  return Boolean(getImageApiKey() || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY);
}

export function getImageProvider(): "gemini" | "openai" | "mock" {
  const raw = (db.prepare("SELECT value FROM settings WHERE key=?").get(SETTING_PROVIDER_KEY) as { value: string } | undefined)?.value;
  if (raw === "gemini" || raw === "openai" || raw === "mock") return raw;
  return "gemini";
}

export function setImageProvider(p: "gemini" | "openai" | "mock") {
  db.prepare(
    "INSERT INTO settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP"
  ).run(SETTING_PROVIDER_KEY, p);
}

export function getImageApiKey(): string {
  const encrypted = (db.prepare("SELECT value FROM settings WHERE key=?").get(SETTING_KEY) as { value: string } | undefined)?.value;
  if (encrypted) return decryptSecret(encrypted);
  // Env fallback
  const provider = getImageProvider();
  if (provider === "openai" && process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  if (provider === "gemini" && process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  throw new Error("Image API key is not configured");
}

export function saveImageApiKey(value: string) {
  db.prepare(
    "INSERT INTO settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP"
  ).run(SETTING_KEY, encryptSecret(value.trim()));
}

export function getImageModel(): string {
  const raw = (db.prepare("SELECT value FROM settings WHERE key=?").get(SETTING_MODEL_KEY) as { value: string } | undefined)?.value;
  const provider = getImageProvider();
  const allowed = PROVIDER_MODELS[provider] || PROVIDER_MODELS.gemini;
  if (raw && allowed.includes(raw)) return raw;
  return allowed[0];
}

export function setImageModel(m: string) {
  const provider = getImageProvider();
  const allowed = PROVIDER_MODELS[provider] || [];
  if (!allowed.includes(m)) throw new Error(`Invalid model "${m}" for provider "${provider}"`);
  db.prepare(
    "INSERT INTO settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP"
  ).run(SETTING_MODEL_KEY, m);
}

export function listImageProviders() {
  return [
    { id: "gemini", label: "Google Gemini (image generation)",  envVar: "GEMINI_API_KEY", help: "Free tier at aistudio.google.com works for low-volume turnaround generation." },
    { id: "openai", label: "OpenAI (gpt-image-1 / dall-e-3)",      envVar: "OPENAI_API_KEY", help: "Higher quality identity-preserving results; gpt-image-1 recommended." },
    { id: "mock",  label: "Mock (no key, deterministic SVG placeholder)", envVar: null,             help: "Useful for development. Generates a colored placeholder per view — not AI, but proves the pipeline." }
  ] as const;
}

export function listImageModelChoices() {
  return PROVIDER_MODELS[getImageProvider()] || [];
}

export class ImageKeyMissingError extends Error {
  constructor() { super("Image API key is not configured"); this.name = "ImageKeyMissingError"; }
}
export class ImageUpstreamError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.name = "ImageUpstreamError"; this.status = status; }
}

// ----------------------------------------------------------------
// Rotation prompts — the actual AI prompt we send with the
// reference image. These were tuned against the operator's
// "do not change wardrobe or environment between campaign
// regenerations" rule.
// ----------------------------------------------------------------

const ROTATION_PROMPT_BASE =
  "Studio portrait of the SAME person in the SAME wardrobe, SAME hairstyle, SAME makeup, and SAME environment / lighting. " +
  "The camera rotates around the subject at exactly the same distance, height, and lens. " +
  "Preserve facial identity (face shape, eye shape, eye color, nose, mouth, skin tone), body proportions, and outfit down to the last detail. " +
  "Photorealistic. Sharp eyes. Natural skin. Single subject. ";

const VIEW_PROMPTS: Record<AvatarView, string> = {
  front:  ROTATION_PROMPT_BASE + "Camera angle: head-on, eye level, looking directly into the lens. This is the canonical FRONT reference for the 4-view turnaround.",
  left:   ROTATION_PROMPT_BASE + "Camera angle: 90 degrees to the subject's LEFT (their right side visible to camera). The subject faces away from the camera at a 3/4 right-profile. Same distance, same height, same lens.",
  right:  ROTATION_PROMPT_BASE + "Camera angle: 90 degrees to the subject's RIGHT (their left side visible to camera). The subject faces away from the camera at a 3/4 left-profile. Same distance, same height, same lens.",
  back:   ROTATION_PROMPT_BASE + "Camera angle: 180 degrees, behind the subject, showing the BACK of the head, shoulders, and outfit. Same distance, same height, same lens."
};

// ----------------------------------------------------------------
// AI call dispatch
// ----------------------------------------------------------------

export type GenerateResult = { png: Buffer; model: string; prompt: string };

export async function generateView(opts: {
  avatarId: string;
  view: AvatarView;
  referenceImagePath: string;
  archetype: string;
  wardrobeStandard: string;
}): Promise<GenerateResult> {
  const provider = getImageProvider();
  const model = getImageModel();
  const prompt = `${VIEW_PROMPTS[opts.view]}\n\nArchetype: ${opts.archetype}.\nWardrobe standard: ${opts.wardrobeStandard}.\nMaintain the EXACT same wardrobe items, colors, and fit.`;

  if (provider === "mock") return mockGenerate(opts, model, prompt);
  if (provider === "openai") return openaiImageGenerate(opts, model, prompt);
  return geminiImageGenerate(opts, model, prompt);
}

// ---- Gemini 2.0 Flash image generation (real call) ----
async function geminiImageGenerate(opts: { avatarId: string; view: AvatarView; referenceImagePath: string }, model: string, prompt: string): Promise<GenerateResult> {
  const key = getImageApiKey();
  const imageBytes = await fs.readFile(opts.referenceImagePath);
  const b64 = imageBytes.toString("base64");
  const mime = opts.referenceImagePath.toLowerCase().endsWith(".png") ? "image/png"
    : opts.referenceImagePath.toLowerCase().endsWith(".webp") ? "image/webp"
    : "image/jpeg";

  const body = {
    contents: [{
      role: "user",
      parts: [
        { inline_data: { mime_type: mime, data: b64 } },
        { text: prompt }
      ]
    }],
    generationConfig: {
      responseModalities: ["IMAGE"],
      temperature: 0.4
    }
  };

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 60_000);
  let res: Response;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: ac.signal
    });
  } finally { clearTimeout(t); }

  if (!res.ok) {
    const t = await res.text();
    if (res.status === 401 || res.status === 403) throw new ImageUpstreamError(`Gemini rejected the API key (HTTP ${res.status})`, res.status);
    if (res.status === 404) throw new ImageUpstreamError(`Model "${model}" not available on Gemini (HTTP ${res.status})`, res.status);
    throw new ImageUpstreamError(`Gemini HTTP ${res.status}: ${t.slice(0, 300)}`, res.status);
  }
  const json = await res.json() as {
    candidates?: Array<{
      content?: { parts?: Array<{ inline_data?: { data?: string; mime_type?: string }; text?: string }> };
    }>;
  };
  const part = json.candidates?.[0]?.content?.parts?.find(p => p.inline_data?.data);
  if (!part?.inline_data?.data) {
    throw new ImageUpstreamError("Gemini did not return an image in the response", 502);
  }
  return { png: Buffer.from(part.inline_data.data, "base64"), model, prompt };
}

// ---- OpenAI gpt-image-1 / dall-e-3 image edit (real call) ----
async function openaiImageGenerate(opts: { avatarId: string; view: AvatarView; referenceImagePath: string }, model: string, prompt: string): Promise<GenerateResult> {
  const key = getImageApiKey();
  const imageBytes = await fs.readFile(opts.referenceImagePath);
  const blob = new Blob([imageBytes]);
  const form = new FormData();
  form.append("model", model);
  form.append("image", blob, "reference.png");
  form.append("prompt", prompt);
  form.append("n", "1");
  form.append("size", "1024x1536");
  if (model === "gpt-image-1") form.append("input_fidelity", "high");

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 90_000);
  let res: Response;
  try {
    const url = model === "gpt-image-1"
      ? "https://api.openai.com/v1/images/edits"
      : "https://api.openai.com/v1/images/generations";
    if (model === "dall-e-3") {
      // dall-e-3 doesn't accept an input image; this branch won't run in
      // real life but the guard keeps the call type-safe.
      res = await fetch(url, {
        method: "POST",
        headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, prompt, n: 1, size: "1024x1536", response_format: "b64_json" }),
        signal: ac.signal
      });
    } else {
      res = await fetch(url, { method: "POST", headers: { "Authorization": `Bearer ${key}` }, body: form, signal: ac.signal });
    }
  } finally { clearTimeout(t); }
  if (!res.ok) {
    const t = await res.text();
    if (res.status === 401) throw new ImageUpstreamError("OpenAI rejected the API key", 401);
    throw new ImageUpstreamError(`OpenAI HTTP ${res.status}: ${t.slice(0, 300)}`, res.status);
  }
  const json = await res.json() as { data?: Array<{ b64_json?: string; url?: string }> };
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new ImageUpstreamError("OpenAI did not return an image in the response", 502);
  return { png: Buffer.from(b64, "base64"), model, prompt };
}

// ---- Mock generator (used only when provider='mock') ----
async function mockGenerate(opts: { avatarId: string; view: AvatarView; referenceImagePath: string }, model: string, prompt: string): Promise<GenerateResult> {
  // Generates a deterministic 1024x1536 SVG with the avatar name + view,
  // rasterized to PNG via sharp (no external call). Useful for CI / dev.
  const sharp = (await import("sharp")).default;
  const colors: Record<AvatarView, [string, string]> = {
    front: ["#6E56CF", "#A78BFA"],
    left:  ["#0EA5E9", "#22D3EE"],
    right: ["#F59E0B", "#FBBF24"],
    back:  ["#10B981", "#34D399"]
  };
  const [c1, c2] = colors[opts.view];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1536" viewBox="0 0 1024 1536">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${c1}"/>
        <stop offset="100%" stop-color="${c2}"/>
      </linearGradient>
    </defs>
    <rect width="1024" height="1536" fill="url(#g)"/>
    <text x="512" y="700" text-anchor="middle" font-family="ui-sans-serif" font-size="72" font-weight="700" fill="white">${opts.avatarId}</text>
    <text x="512" y="820" text-anchor="middle" font-family="ui-sans-serif" font-size="48" font-weight="500" fill="white" opacity="0.85">${opts.view.toUpperCase()} (mock)</text>
    <text x="512" y="1480" text-anchor="middle" font-family="ui-monospace" font-size="22" fill="white" opacity="0.6">No real model — set Image API key in Settings</text>
  </svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return { png, model, prompt };
}

// ----------------------------------------------------------------
// Orchestration: status transitions + persistence
// ----------------------------------------------------------------

function setViewGen(avatarId: string, view: AvatarView, patch: Partial<{
  generation_status: "idle" | "generating" | "ready" | "failed";
  generation_model: string | null;
  generation_prompt: string | null;
  generation_error: string | null;
  generation_started_at: string | null;
  generation_finished_at: string | null;
  file_path: string | null;
  status: "missing" | "ready";
}>) {
  const fields: string[] = [];
  const values: unknown[] = [];
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    fields.push(`${k}=?`);
    values.push(v);
  }
  if (!fields.length) return;
  values.push(avatarId, view);
  db.prepare(`UPDATE avatar_views SET ${fields.join(", ")}, updated_at=CURRENT_TIMESTAMP WHERE avatar_id=? AND view=?`).run(...values);
}

function setAvatarTurnaround(avatarId: string, patch: Partial<{
  turnaround_status: "draft" | "generating" | "incomplete" | "ready" | "failed";
  turnaround_model: string | null;
  turnaround_started_at: string | null;
  turnaround_finished_at: string | null;
  turnaround_error: string | null;
}>) {
  const fields: string[] = [];
  const values: unknown[] = [];
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    fields.push(`${k}=?`);
    values.push(v);
  }
  if (!fields.length) return;
  values.push(avatarId);
  db.prepare(`UPDATE avatars SET ${fields.join(", ")}, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(...values);
}

function insertAudit(opts: {
  id: string;
  avatar_id: string;
  view: AvatarView;
  model: string;
  prompt: string;
  reference_image_path: string;
  result_path?: string | null;
  status: "generating" | "ready" | "failed";
  error?: string | null;
}) {
  db.prepare(
    "INSERT INTO avatar_generations(id,avatar_id,view,model,prompt,reference_image_path,result_path,status,error,started_at,finished_at) VALUES(?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)"
  ).run(opts.id, opts.avatar_id, opts.view, opts.model, opts.prompt, opts.reference_image_path, opts.result_path ?? null, opts.status, opts.error ?? null);
}

async function getReferenceImageBytes(avatarId: string): Promise<{ path: string; dir: string }> {
  const ref = (db.prepare("SELECT reference_image_path FROM avatars WHERE id=?").get(avatarId) as { reference_image_path: string | null } | undefined)?.reference_image_path;
  if (!ref) throw new Error("No reference image on this avatar. Upload one first.");
  // The reference_image_path may be either an absolute path or a public/... path
  let abs = ref;
  if (!path.isAbsolute(abs)) abs = path.resolve(process.cwd(), ref);
  // Verify the file exists
  await fs.access(abs);
  const dir = path.dirname(abs);
  return { path: abs, dir };
}

async function saveViewPng(avatarId: string, view: AvatarView, png: Buffer): Promise<{ relativePath: string; absolutePath: string }> {
  // Save next to the reference image so the asset route serves both
  const { dir } = await getReferenceImageBytes(avatarId);
  const fileName = `${view}.png`;
  const abs = path.join(dir, fileName);
  await fs.writeFile(abs, png);
  // The asset route expects paths under /public/avatars/<id>/<filename>
  // The reference is saved at /app/public/avatars/<id>/identity.<ext> in the
  // uploaded convention. Make the path relative to process.cwd() so the
  // existing asset route can serve it.
  const cwd = process.cwd();
  let rel = path.relative(cwd, abs).replace(/\\/g, "/");
  if (!rel.startsWith("public/")) rel = "public/" + rel.replace(/^.*?public\//, "");
  return { relativePath: "/" + rel, absolutePath: abs };
}

export type StartTurnaroundResult = { started: AvatarView[]; skipped: AvatarView[]; reason?: string };

export async function startTurnaround(avatarId: string, opts: { views?: AvatarView[] } = {}): Promise<StartTurnaroundResult> {
  const wanted = opts.views && opts.views.length ? opts.views : VIEWS;
  const avatar = db.prepare("SELECT id, reference_image_path, archetype, wardrobe_standard, name FROM avatars WHERE id=?").get(avatarId) as { id: string; reference_image_path: string | null; archetype: string; wardrobe_standard: string; name: string } | undefined;
  if (!avatar) throw new Error("Avatar not found");
  if (!avatar.reference_image_path) {
    return { started: [], skipped: wanted, reason: "Upload a reference identity photo first." };
  }
  const provider = getImageProvider();
  const model = getImageModel();
  const now = new Date().toISOString();
  const started: AvatarView[] = [];
  for (const view of wanted) {
    const id = crypto.randomUUID();
    const prompt = `${VIEW_PROMPTS[view]}\n\nArchetype: ${avatar.archetype}.\nWardrobe standard: ${avatar.wardrobe_standard}.`;
    insertAudit({ id, avatar_id: avatarId, view, model, prompt, reference_image_path: avatar.reference_image_path, status: "generating" });
    setViewGen(avatarId, view, {
      generation_status: "generating",
      generation_model: model,
      generation_prompt: prompt,
      generation_error: null,
      generation_started_at: now,
      generation_finished_at: null
    });
    started.push(view);
  }
  if (started.length) {
    setAvatarTurnaround(avatarId, {
      turnaround_status: "generating",
      turnaround_model: model,
      turnaround_started_at: now,
      turnaround_finished_at: null,
      turnaround_error: null
    });
  }
  // Fire-and-forget. The route returns immediately; the audit row flips
  // to ready/failed when the actual call finishes.
  void runGenerationsInBackground(avatarId, started, model);
  return { started, skipped: wanted.filter(v => !started.includes(v)) };
}

async function runGenerationsInBackground(avatarId: string, views: AvatarView[], model: string) {
  const avatar = db.prepare("SELECT id, reference_image_path, archetype, wardrobe_standard FROM avatars WHERE id=?").get(avatarId) as { id: string; reference_image_path: string | null; archetype: string; wardrobe_standard: string } | undefined;
  if (!avatar) return;
  let anyFailed = false;
  let allOk = true;
  for (const view of views) {
    try {
      const result = await generateView({
        avatarId,
        view,
        referenceImagePath: avatar.reference_image_path!,
        archetype: avatar.archetype,
        wardrobeStandard: avatar.wardrobe_standard
      });
      const saved = await saveViewPng(avatarId, view, result.png);
      setViewGen(avatarId, view, {
        file_path: saved.relativePath,
        status: "ready",
        generation_status: "ready",
        generation_model: result.model,
        generation_prompt: result.prompt,
        generation_finished_at: new Date().toISOString(),
        generation_error: null
      });
      db.prepare("UPDATE avatar_generations SET result_path=?, status='ready', finished_at=CURRENT_TIMESTAMP WHERE avatar_id=? AND view=? AND status='generating' AND result_path IS NULL").run(saved.relativePath, avatarId, view);
    } catch (e) {
      anyFailed = true;
      allOk = false;
      const msg = e instanceof Error ? e.message : String(e);
      setViewGen(avatarId, view, {
        generation_status: "failed",
        generation_finished_at: new Date().toISOString(),
        generation_error: msg
      });
      db.prepare("UPDATE avatar_generations SET status='failed', error=?, finished_at=CURRENT_TIMESTAMP WHERE avatar_id=? AND view=? AND status='generating'").run(msg, avatarId, view);
    }
  }
  // Update turnaround_status
  const readyCount = (db.prepare("SELECT COUNT(*) as n FROM avatar_views WHERE avatar_id=? AND status='ready'").get(avatarId) as { n: number }).n;
  const total = VIEWS.length;
  let next: "draft" | "generating" | "incomplete" | "ready" | "failed" = "incomplete";
  if (readyCount === total) next = "ready";
  else if (readyCount === 0) next = anyFailed ? "failed" : "draft";
  else next = "incomplete";
  setAvatarTurnaround(avatarId, {
    turnaround_status: next,
    turnaround_finished_at: new Date().toISOString(),
    turnaround_error: allOk ? null : (anyFailed ? "One or more views failed" : null)
  });
  // Update the parent avatar status to "ready" only when all 4 views are ready.
  if (readyCount === total) {
    db.prepare("UPDATE avatars SET status='ready' WHERE id=?").run(avatarId);
  }
}
