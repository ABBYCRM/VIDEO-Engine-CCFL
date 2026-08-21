import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { writeUgcPackage } from "@/lib/nvidia/ugc-writer";

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const result = await writeUgcPackage({
      mission: String(body.mission || ""),
      tone: body.tone ? String(body.tone) : undefined,
      contextMode: body.contextMode ? String(body.contextMode) : undefined,
      targetSeconds: Number.isFinite(Number(body.targetSeconds)) ? Number(body.targetSeconds) : 30
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
