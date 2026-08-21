import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getAvatar, updateAvatarReference } from "@/lib/avatars";
import { generateAvatarImage, isNvidiaImageModel } from "@/lib/nvidia/image";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const avatar = getAvatar(id);
    if (!avatar) return NextResponse.json({ error: "Avatar not found" }, { status: 404 });
    const body = await req.json().catch(() => ({}));
    const model = isNvidiaImageModel(body?.model) ? body.model : undefined;
    const fallback = `${avatar.archetype}. ${avatar.wardrobeStandard}. Photorealistic adult spokesperson portrait, chest-up, eye-level camera, realistic skin texture and eyes, professional wardrobe, neutral studio background.`;
    const prompt = String(body?.prompt || fallback).trim().slice(0, 10000);
    if (!prompt) return NextResponse.json({ error: "Prompt is required" }, { status: 400 });

    const result = await generateAvatarImage({ prompt, model });
    const targetDir = path.resolve(process.cwd(), "public", "avatars", id);
    await fs.mkdir(targetDir, { recursive: true });
    const filename = "identity.png";
    await fs.writeFile(path.join(targetDir, filename), Buffer.from(result.base64, "base64"));
    updateAvatarReference(id, `/avatars/${id}/${filename}`);
    return NextResponse.json({ avatar: getAvatar(id), model: result.model });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
