import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { generateAvatarImage, isNvidiaImageModel } from "@/lib/nvidia/image";
import { saveGeneratedImage } from "@/lib/media-library";
import { isImageGenEnabled } from "@/lib/feature-flags";

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
    const prompt = String(body.prompt || "");
    const model = body.model && isNvidiaImageModel(body.model) ? body.model : undefined;
    const result = await generateAvatarImage({ prompt, model, seed: Number(body.seed || 0) });
    const saved = await saveGeneratedImage({
      base64: result.base64,
      source: String(body.source || "nvidia-avatar"),
      model: result.model,
      prompt,
      mimeType: result.mimeType
    });
    return NextResponse.json({ ...result, assetId: saved.id, assetUrl: saved.url });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
