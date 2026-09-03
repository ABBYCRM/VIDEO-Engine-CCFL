import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { generateImageWithFallback } from "@/lib/mktn/providers";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  try {
    return NextResponse.json(await generateImageWithFallback(body));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Every image provider failed." }, { status: error instanceof TypeError ? 400 : 502 });
  }
}
