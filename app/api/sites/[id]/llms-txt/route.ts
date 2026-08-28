import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { buildLlmsTxt } from "@/lib/geo/generate";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    const text = buildLlmsTxt(id);
    return new Response(text, { headers: { "content-type": "text/plain; charset=utf-8" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
