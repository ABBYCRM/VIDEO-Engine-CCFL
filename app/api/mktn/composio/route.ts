import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { composioAction, isComposioConfigured } from "@/lib/composio/client";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isComposioConfigured()) return NextResponse.json({ error: "Composio is not configured. Connect it in Integrations." }, { status: 409 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const slug = typeof body?.slug === "string" ? body.slug.trim() : "";
  const toolkit = typeof body?.toolkit === "string" ? body.toolkit.trim() : "";
  const args = body?.args && typeof body.args === "object" && !Array.isArray(body.args) ? body.args as Record<string, unknown> : null;
  if (!slug || !toolkit || !args) return NextResponse.json({ error: "toolkit, slug, and args object are required." }, { status: 400 });
  try {
    const result = await composioAction({ toolkit, slug, args });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Composio action failed." }, { status: 502 });
  }
}
