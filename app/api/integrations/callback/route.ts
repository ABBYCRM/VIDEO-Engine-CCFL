// OAuth callback. Composio redirects the browser here after the user
// grants or denies access on the provider. We expect:
//   ?status=success|failed
//   &connected_account_id=ca_xxx
//   &toolkit=instagram
//   &user_id=admin
//
// We persist the connected_account_id, refresh its status from Composio, and
// redirect the operator back to /integrations with a toast-style flash.

import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { ComposioAuthError, getComposio, getToolkitMeta } from "@/lib/composio/client";
import { verifyOAuthState } from "@/lib/auth";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const status = url.searchParams.get("status") || "failed";
  const connectedAccountId = url.searchParams.get("connected_account_id") || url.searchParams.get("connectedAccountId");
  const toolkit = url.searchParams.get("toolkit") || "";
  const state = url.searchParams.get("state");
  const userId = "admin";
  if (!toolkit || !verifyOAuthState(state, toolkit)) {
    return NextResponse.redirect(new URL("/integrations?connected=failed&reason=invalid_oauth_state", req.url));
  }
  const reason = url.searchParams.get("reason") || url.searchParams.get("error") || "";

  if (!connectedAccountId || status === "failed") {
    const qs = new URLSearchParams({ connected: "failed", toolkit, reason: reason.slice(0, 200) });
    return NextResponse.redirect(new URL(`/integrations?${qs.toString()}`, req.url));
  }

  // Pull the live status from Composio so we have the canonical state + raw.
  let upstreamStatus = "ACTIVE";
  let rawJson: string | null = null;
  try {
    const client = getComposio();
    const detail = await client.connectedAccounts.get(connectedAccountId);
    upstreamStatus = (detail as { status?: string }).status ?? "ACTIVE";
    rawJson = JSON.stringify(detail);
  } catch (e) {
    if (e instanceof ComposioAuthError) {
      const qs = new URLSearchParams({ connected: "failed", toolkit, reason: e.message.slice(0, 200) });
      return NextResponse.redirect(new URL(`/integrations?${qs.toString()}`, req.url));
    }
    // Don't block the redirect on a transient upstream error — we still
    // persist the connected_account_id so the operator can refresh later.
  }

  // Upsert into our table. The (toolkit, user_id) unique key makes the
  // re-connect case idempotent.
  const id = crypto.randomUUID();
  const meta = getToolkitMeta(toolkit);
  db.prepare(
    "INSERT INTO connected_accounts(id, toolkit, connected_account_id, user_id, status, alias, raw_json, last_sync_at) VALUES(?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(toolkit, user_id) DO UPDATE SET connected_account_id=excluded.connected_account_id, status=excluded.status, raw_json=excluded.raw_json, last_sync_at=CURRENT_TIMESTAMP"
  ).run(id, meta.id, connectedAccountId, userId, upstreamStatus, null, rawJson);

  const qs = new URLSearchParams({ connected: "success", toolkit: meta.id, ca: connectedAccountId, status: upstreamStatus });
  return NextResponse.redirect(new URL(`/integrations?${qs.toString()}`, req.url));
}
