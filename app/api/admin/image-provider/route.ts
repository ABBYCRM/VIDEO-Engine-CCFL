import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getImageProvider, getImageModel, setImageProvider, isImageProviderConfigured, type ImageProvider } from "@/lib/avatar-generation/client";

export const runtime = "nodejs";

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ provider: getImageProvider(), model: getImageModel(), configured: isImageProviderConfigured() });
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const provider = String(body?.provider || "");
  if (!["gemini", "openai", "xai", "a2e", "mock"].includes(provider)) {
    return NextResponse.json({ error: "provider must be one of gemini, openai, xai, a2e, mock" }, { status: 400 });
  }
  setImageProvider(provider as ImageProvider);
  return NextResponse.json({ ok: true, provider: getImageProvider(), model: getImageModel(), configured: isImageProviderConfigured() });
}
