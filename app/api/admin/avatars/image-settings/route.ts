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

function payload() {
  const provider = getImageProvider();
  return {
    configured: isImageProviderConfigured(),
    provider,
    model: getImageModel(),
    providers: listImageProviders().map(p => ({ id: p.id, label: p.label, envVar: p.envVar, help: p.help })),
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
    if (!["gemini", "openai", "xai", "mock"].includes(provider)) return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
    setImageProvider(provider);
  }
  if (body.model && listImageModelChoices().includes(String(body.model))) setImageModel(String(body.model));
  if (body.apiKey) saveImageApiKey(String(body.apiKey));
  return NextResponse.json(payload());
}
