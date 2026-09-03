import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { clearMktnProviderSecret, getMktnProviderStatus, MKTN_PROVIDER_IDS, saveMktnProviderSecret, type MktnProviderId } from "@/lib/mktn/settings";
import { isComposioConfigured } from "@/lib/composio/client";

export const runtime = "nodejs";

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ providers: getMktnProviderStatus(), composio: { configured: isComposioConfigured() } });
}

export async function POST(request: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as { provider?: unknown; apiKey?: unknown; clear?: unknown } | null;
  const provider = body?.provider;
  if (typeof provider !== "string" || !MKTN_PROVIDER_IDS.includes(provider as MktnProviderId)) {
    return NextResponse.json({ error: "Invalid provider." }, { status: 400 });
  }
  try {
    if (body?.clear === true) clearMktnProviderSecret(provider as MktnProviderId);
    else if (typeof body?.apiKey === "string") saveMktnProviderSecret(provider as MktnProviderId, body.apiKey);
    else return NextResponse.json({ error: "apiKey or clear=true is required." }, { status: 400 });
    return NextResponse.json({ ok: true, providers: getMktnProviderStatus() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save provider settings." }, { status: 400 });
  }
}
