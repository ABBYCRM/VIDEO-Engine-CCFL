import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { buildYouTubeAuthUrl } from "@/lib/youtube";

export const runtime = "nodejs";

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.redirect(buildYouTubeAuthUrl());
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
