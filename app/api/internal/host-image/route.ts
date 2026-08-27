import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getProviderKey } from "@/lib/providers";
import { generateAvatarImage, isNvidiaImageModel } from "@/lib/nvidia/image";
import { saveGeneratedImage } from "@/lib/media-library";
import { isImageGenEnabled } from "@/lib/feature-flags";

const XAI_MODELS = new Set(["grok-imagine-image", "grok-imagine-image-2.0", "grok-imagine-image-quality"]);

async function generateXai(prompt: string, model: string) {
  const key = getProviderKey("grok");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch("https://api.x.ai/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt, n: 1 }),
      signal: controller.signal,
      cache: "no-store"
    });
    if (!response.ok) throw new Error(`xAI image API HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
    const json = await response.json() as { data?: Array<{ url?: string; b64_json?: string }> };
    const item = json.data?.[0];
    if (item?.b64_json) return { base64: item.b64_json, mimeType: "image/png", model };
    if (!item?.url) throw new Error("xAI image API returned no image");
    const download = await fetch(item.url, { signal: controller.signal, cache: "no-store" });
    if (!download.ok) throw new Error(`xAI image download HTTP ${download.status}`);
    const mimeType = download.headers.get("content-type")?.startsWith("image/") ? download.headers.get("content-type")! : "image/png";
    return { base64: Buffer.from(await download.arrayBuffer()).toString("base64"), mimeType, model };
  } finally { clearTimeout(timer); }
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isImageGenEnabled()) {
    return NextResponse.json({
      error: "Image generation is disabled. Use the manual Calendar, Creator tab, or Library.",
      feature: "image_generation",
      disabled: true
    }, { status: 410 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const prompt = String(body.prompt || "").trim();
    const model = String(body.model || "").trim();
    if (!prompt) return NextResponse.json({ error: "Host portrait prompt is required" }, { status: 400 });
    let result: { base64: string; mimeType: string; model: string };
    if (XAI_MODELS.has(model)) result = await generateXai(prompt, model);
    else if (isNvidiaImageModel(model)) result = await generateAvatarImage({ prompt, model, seed: Number(body.seed || 0) });
    else return NextResponse.json({ error: "Unsupported hosted image model" }, { status: 400 });
    const saved = await saveGeneratedImage({ base64: result.base64, source: "fresh-host", model: result.model, prompt, mimeType: result.mimeType });
    return NextResponse.json({ ...result, assetId: saved.id, assetUrl: saved.url });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
