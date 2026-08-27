import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getImageProvider, getImageModel, setImageProvider, setImageModel, isImageProviderConfigured, listImageModelsFor, type ImageProvider } from "@/lib/avatar-generation/client";

export const runtime = "nodejs";

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ provider: getImageProvider(), model: getImageModel(), configured: isImageProviderConfigured() });
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const provider = String(body?.provider || "");
  if (!["hedra", "gemini", "openai", "xai", "a2e", "mock"].includes(provider)) {
    return NextResponse.json({ error: "provider must be one of hedra, gemini, openai, xai, a2e, mock" }, { status: 400 });
  }
  const nextProvider = provider as ImageProvider;
  const model = body?.model ? String(body.model) : "";
  if (model && !listImageModelsFor(nextProvider).includes(model)) {
    return NextResponse.json({ error: `Invalid model "${model}" for provider "${provider}"` }, { status: 400 });
  }
  setImageProvider(nextProvider);
  if (model) setImageModel(model);
  return NextResponse.json({ ok: true, provider: getImageProvider(), model: getImageModel(), configured: isImageProviderConfigured() });
}
