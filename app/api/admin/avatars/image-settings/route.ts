import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  getImageModel,
  getImageProvider,
  isImageProviderConfigured,
  listImageModelChoices,
  listImageProviders,
  saveImageApiKey,
  setImageModel,
  setImageProvider,
  type ImageProvider
} from "@/lib/avatar-generation/client";

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

function payload() {
  const provider = getImageProvider();
  return {
    configured: isImageProviderConfigured(),
    provider,
    model: getImageModel(),
    providers: listImageProviders().map(p => ({
      id: p.id,
      label: p.label,
      envVar: p.envVar,
      help: p.help,
      models: PROVIDER_MODELS[p.id],
      supportsTurnaround: p.id === "gemini" || p.id === "openai" || p.id === "mock"
    })),
    modelChoices: listImageModelChoices(),
    maskedKey: null
  };
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(payload());
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (body.provider) {
    const provider = String(body.provider) as ImageProvider;
    if (!["gemini", "openai", "xai", "mock"].includes(provider)) {
      return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
    }
    setImageProvider(provider);
  }
  if (body.model && listImageModelChoices().includes(String(body.model))) setImageModel(String(body.model));
  if (body.apiKey) saveImageApiKey(String(body.apiKey));
  return NextResponse.json(payload());
}
