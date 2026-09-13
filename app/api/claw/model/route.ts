import { NextResponse } from "next/server";
import { getClawModel, isClawModelEnvOverridden, setClawModel } from "@/lib/nvidia/client";
import { isNvidiaModelId, listNvidiaModelIds, NVIDIA_MODELS } from "@/lib/nvidia/models";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    model: getClawModel(),
    envOverridden: isClawModelEnvOverridden(),
    models: listNvidiaModelIds()
      .filter((id) => id !== "disabled")
      .map((id) => NVIDIA_MODELS[id])
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const model = body.model;
  if (!isNvidiaModelId(model) || model === "disabled") {
    return NextResponse.json({ error: "Invalid model id" }, { status: 400 });
  }
  if (isClawModelEnvOverridden()) {
    return NextResponse.json({ error: "CLAW_NVIDIA_MODEL env var is set and overrides this setting" }, { status: 409 });
  }
  setClawModel(model);
  return NextResponse.json({ model: getClawModel(), envOverridden: false });
}
