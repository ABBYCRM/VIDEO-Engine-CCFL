// Temporary debug: list the connected accounts on the operator's Composio
// project. Tells us which toolkits are actually wired. Will be removed
// after we finish verifying.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getComposio, isComposioConfigured } from "@/lib/composio/client";

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isComposioConfigured()) return NextResponse.json({ error: "Composio not configured" }, { status: 400 });
  try {
    const client = getComposio();
    const r = await client.connectedAccounts.list();
    const items = (r as { items?: unknown[] }).items ?? (Array.isArray(r) ? (r as unknown[]) : []);
    const slim = (Array.isArray(items) ? items : []).map((it: any) => ({
      id: it.id,
      toolkit: it.toolkit?.slug ?? it.toolkit?.name ?? it.toolkit ?? "?",
      userId: it.userId ?? it.user_id,
      status: it.status,
      authConfig: it.authConfig?.id ?? it.auth_config?.id ?? null,
      createdAt: it.createdAt ?? it.created_at ?? null
    }));
    return NextResponse.json({ count: slim.length, accounts: slim });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
