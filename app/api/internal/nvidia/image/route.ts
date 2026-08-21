import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { generateAvatarImage, isNvidiaImageModel } from "@/lib/nvidia/image";

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const prompt = String(body.prompt || "");
    const model = body.model && isNvidiaImageModel(body.model) ? body.model : undefined;
    const result = await generateAvatarImage({ prompt, model, seed: Number(body.seed || 0) });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
