// One-shot sync. Reads the connected accounts already on the operator's
// Composio project (the dashboard) and mirrors them into our connected_accounts
// table. Idempotent: writes use INSERT ... ON CONFLICT(toolkit, user_id) DO
// UPDATE so re-running does not duplicate rows.

import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { ComposioAuthError, getComposio, getToolkitMeta, isComposioConfigured } from "@/lib/composio/client";

const USER_ID = "admin";

export async function POST() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isComposioConfigured()) return NextResponse.json({ error: "Composio not configured" }, { status: 400 });
  let client;
  try { client = getComposio(); } catch (e) {
    if (e instanceof ComposioAuthError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
  let items: any[];
  try {
    const r = await client.connectedAccounts.list();
    items = (r as { items?: unknown[] }).items ?? (Array.isArray(r) ? (r as unknown[]) : []);
    if (!Array.isArray(items)) return NextResponse.json({ error: "Composio returned no items array" }, { status: 502 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }

  const insert = db.prepare(
    "INSERT INTO connected_accounts(id, toolkit, connected_account_id, user_id, status, alias, raw_json, last_sync_at) VALUES(?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(toolkit, user_id) DO UPDATE SET connected_account_id=excluded.connected_account_id, status=excluded.status, raw_json=excluded.raw_json, last_sync_at=CURRENT_TIMESTAMP"
  );
  const tx = db.transaction((rows: Array<{ id: string; toolkit: string; status: string; raw: unknown }>) => {
    for (const r of rows) insert.run(crypto.randomUUID(), r.toolkit, r.id, USER_ID, r.status, null, JSON.stringify(r.raw));
  });
  type MirroredRow = { id: string; toolkit: string; status: string; raw: unknown };
  const mirrored: MirroredRow[] = [];
  for (const it of items) {
    const id = (it as any).id;
    if (!id) continue;
    const toolkitRaw = (it as any).toolkit?.slug ?? (it as any).toolkit?.name ?? (it as any).toolkit;
    if (!toolkitRaw) continue;
    const status = (it as any).status ?? "ACTIVE";
    const meta = getToolkitMeta(toolkitRaw);
    mirrored.push({ id, toolkit: meta.id, status, raw: it });
  }
  tx(mirrored);
  return NextResponse.json({ mirrored: mirrored.length, accounts: mirrored.map(m => ({ id: m.id, toolkit: m.toolkit, status: m.status })) });
}
