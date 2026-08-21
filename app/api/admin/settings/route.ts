import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  getEngineSettings,
  saveA2eApiKey,
  saveEngineSettings,
  saveGeminiApiKey,
  saveHedraApiKey,
  saveXaiApiKey
} from "@/lib/settings";
import { PROVIDERS, type ProviderId } from "@/lib/providers";

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(getEngineSettings());
}

export async function PUT(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();

  if (body.geminiApiKey) saveGeminiApiKey(String(body.geminiApiKey));
  if (body.xaiApiKey) saveXaiApiKey(String(body.xaiApiKey));
  if (body.a2eApiKey) saveA2eApiKey(String(body.a2eApiKey));
  if (body.hedraApiKey) saveHedraApiKey(String(body.hedraApiKey));

  if (body.resolution && !["720p","1080p","4k"].includes(body.resolution)) return NextResponse.json({ error: "Invalid resolution" }, { status: 400 });
  if (body.aspectRatio && !["9:16","16:9"].includes(body.aspectRatio)) return NextResponse.json({ error: "Invalid aspect ratio" }, { status: 400 });

  let defaultProvider: ProviderId | undefined;
  if (body.defaultProvider) {
    if (!["veo", "grok", "a2e", "hedra"].includes(body.defaultProvider)) return NextResponse.json({ error: "Invalid defaultProvider" }, { status: 400 });
    defaultProvider = body.defaultProvider;
  }

  // Validate per-provider model choices
  const validatedModel: Record<string, string> = {};
  for (const p of ["veo", "grok", "a2e", "hedra"] as ProviderId[]) {
    const key = `${p}Model`;
    if (body[key]) {
      const m = String(body[key]);
      if (!PROVIDERS[p].modelChoices.includes(m)) {
        return NextResponse.json({ error: `Invalid model "${m}" for provider ${p}` }, { status: 400 });
      }
      validatedModel[key] = m;
    }
  }

  saveEngineSettings({
    defaultProvider,
    resolution: body.resolution,
    aspectRatio: body.aspectRatio,
    model: body.model,    // legacy compat
    veoModel: validatedModel.veoModel,
    grokModel: validatedModel.grokModel,
    a2eModel: validatedModel.a2eModel,
    hedraModel: validatedModel.hedraModel
  });
  return NextResponse.json(getEngineSettings());
}
