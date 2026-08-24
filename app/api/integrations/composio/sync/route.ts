import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { ComposioAuthError, isComposioConfigured, syncConnectedAccounts } from "@/lib/composio/client";

export async function POST() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isComposioConfigured()) return NextResponse.json({ error: "Composio not configured" }, { status: 400 });
  try {
    const result = await syncConnectedAccounts();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof ComposioAuthError) return NextResponse.json({ error: e.message }, { status: 400 });
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
