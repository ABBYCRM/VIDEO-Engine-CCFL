import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getImageProvider, getImageModel, isImageProviderConfigured, setImageProvider, setImageModel, listImageModelsFor, type ImageProvider } from "@/lib/avatar-generation/client";
import { isImageGenEnabled } from "@/lib/feature-flags";

export const runtime = "nodejs";

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Read-only introspection is still allowed so legacy UI loads don't crash.
  // The image_gen_enabled flag is returned so the UI can render a banner.
  return NextResponse.json({
    provider: getImageProvider(),
    model: getImageModel(),
    configured: isImageProviderConfigured(),
    imageGenEnabled: isImageGenEnabled()
  });
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Image generation is disabled (2026-08-27 operator directive). Refuse to
  // change the image provider until the operator flips IMAGE_GEN_ENABLED back on.
  if (!isImageGenEnabled()) {
    return NextResponse.json({
      error: "Image generation is disabled. Set IMAGE_GEN_ENABLED=true to re-enable image provider switching.",
      feature: "image_generation",
      disabled: true
    }, { status: 410 });
  }
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
