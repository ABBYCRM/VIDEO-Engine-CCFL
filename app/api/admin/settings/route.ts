import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getEngineSettings, saveEngineSettings, saveGeminiApiKey } from "@/lib/settings";

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(getEngineSettings());
}
export async function PUT(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  if (body.geminiApiKey) saveGeminiApiKey(String(body.geminiApiKey));
  if (body.resolution && !["720p","1080p","4k"].includes(body.resolution)) return NextResponse.json({ error: "Invalid resolution" }, { status: 400 });
  if (body.aspectRatio && !["9:16","16:9"].includes(body.aspectRatio)) return NextResponse.json({ error: "Invalid aspect ratio" }, { status: 400 });
  saveEngineSettings({ model: body.model, resolution: body.resolution, aspectRatio: body.aspectRatio });
  return NextResponse.json(getEngineSettings());
}
