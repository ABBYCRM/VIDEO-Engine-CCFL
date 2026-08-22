import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  getAvatarImageModel,
  getAvatarImageProvider,
  isAvatarImageProviderConfigured,
  listAvatarImageModelChoices,
  listAvatarImageProviders,
  saveAvatarImageApiKey,
  setAvatarImageModel,
  setAvatarImageProvider,
  type AvatarImageProvider
} from "@/lib/avatar-generation/provider";

function payload() {
  return {
    configured: isAvatarImageProviderConfigured(),
    provider: getAvatarImageProvider(),
    model: getAvatarImageModel(),
    providers: listAvatarImageProviders(),
    modelChoices: listAvatarImageModelChoices(),
    maskedKey: null
  };
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(payload());
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    if (body.provider) {
      const provider = String(body.provider) as AvatarImageProvider;
      if (!["nvidia", "gemini", "openai", "xai", "mock"].includes(provider)) {
        return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
      }
      setAvatarImageProvider(provider);
    }
    if (body.model && listAvatarImageModelChoices().includes(String(body.model))) setAvatarImageModel(String(body.model));
    if (body.apiKey) saveAvatarImageApiKey(String(body.apiKey));
    return NextResponse.json(payload());
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
