// Image API settings. The 4-view turnaround generator needs a real
// image-generation model. The operator picks the provider + model in
// Settings → Avatars; the choice is encrypted and persisted in the
// settings table.
//
//   GET  /api/admin/avatars/image-settings
//     -> { configured, provider, model, providers: [...], modelChoices: [...], maskedKey }
//
//   POST /api/admin/avatars/image-settings
//     body: { provider?, model?, apiKey? }
//     -> { ok: true, ...same as GET }

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
  setImageProvider
} from "@/lib/avatar-generation/client";

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const provider = getImageProvider();
  return NextResponse.json({
    configured: isImageProviderConfigured(),
    provider,
    model: getImageModel(),
    providers: listImageProviders().map(p => ({ id: p.id, label: p.label, envVar: p.envVar, help: p.help })),
    modelChoices: listImageModelChoices(),
    maskedKey: null
  });
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (body.provider) {
    if (!["gemini", "openai", "mock"].includes(body.provider)) {
      return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
    }
    setImageProvider(body.provider);
  }
  if (body.model) {
    try { setImageModel(String(body.model)); } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
    }
  }
  if (body.apiKey) saveImageApiKey(String(body.apiKey));
  return NextResponse.json({
    configured: isImageProviderConfigured(),
    provider: getImageProvider(),
    model: getImageModel(),
    providers: listImageProviders().map(p => ({ id: p.id, label: p.label, envVar: p.envVar, help: p.help })),
    modelChoices: listImageModelChoices()
  });
}
