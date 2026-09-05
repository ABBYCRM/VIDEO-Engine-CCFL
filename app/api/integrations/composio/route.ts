// Real Composio integration endpoints.
//
//   GET    /api/integrations/composio
//     -> { configured, keyPresent, toolkits: [{ id, label, status, connectedAccountId, alias, requiresBusiness, publishable }] }
//
//   POST   /api/integrations/composio
//     body: { toolkit: "youtube", alias?: string }
//     -> 200 { redirectUrl }   (operator must navigate the browser to this URL)
//
//   DELETE /api/integrations/composio?connectedAccountId=ca_xxx
//     -> 200 { ok: true }      (disconnects on Composio + removes our row)
//
//   POST   /api/integrations/composio
//     body: { toolkit, authConfigId }   <- save the auth config id for a toolkit
//     -> 200 { ok: true }
//
//   POST   /api/integrations/composio/refresh
//     body: { connectedAccountId }
//     -> 200 { status, raw }   (force a server-side re-fetch from Composio)

import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createOAuthState, requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  COMPOSIO_TOOLKITS,
  ComposioAuthError,
  ComposioTimeoutError,
  ComposioUpstreamError,
  addCustomToolkit,
  authorizeToolkit,
  getAuthConfigId,
  getComposio,
  getToolkitMeta,
  isComposioConfigured,
  isComposioConsumer,
  listCustomToolkits,
  removeCustomToolkit,
  saveComposioApiKey,
  setAuthConfigId,
  syncConnectedAccounts,
  withTimeout
} from "@/lib/composio/client";

const USER_ID = "admin"; // single-operator app; one user_id per workspace

function readRows() {
  return db.prepare(
    "SELECT id, toolkit, connected_account_id, user_id, status, alias, raw_json, created_at, last_sync_at FROM connected_accounts ORDER BY created_at DESC"
  ).all() as Array<{
    id: string; toolkit: string; connected_account_id: string; user_id: string;
    status: string; alias: string | null; raw_json: string | null;
    created_at: string; last_sync_at: string | null;
  }>;
}

function buildToolkitView() {
  const rows = readRows();
  const custom = listCustomToolkits();

  // Union of every toolkit slug we should show: the curated catalog, the
  // operator's added ("custom") toolkits, and anything with a connected
  // account row (so a synced connection never disappears from the list).
  type Entry = { id: string; label: string; custom: boolean; requiresBusiness: boolean; publishable: boolean };
  const entries = new Map<string, Entry>();
  for (const t of COMPOSIO_TOOLKITS) {
    entries.set(t.id, { id: t.id, label: t.label, custom: false, requiresBusiness: t.requiresBusiness, publishable: t.publishable });
  }
  for (const c of custom) {
    if (!entries.has(c.slug)) {
      entries.set(c.slug, { id: c.slug, label: c.label, custom: true, requiresBusiness: false, publishable: false });
    }
  }
  for (const r of rows) {
    if (!entries.has(r.toolkit)) {
      const meta = getToolkitMeta(r.toolkit);
      entries.set(r.toolkit, { id: r.toolkit, label: meta.label, custom: true, requiresBusiness: false, publishable: false });
    }
  }

  return [...entries.values()].map(t => {
    const row = rows.find(r => r.toolkit === t.id);
    const authConfigId = getAuthConfigId(t.id);
    const logo = custom.find(c => c.slug === t.id)?.logo ?? null;
    return {
      id: t.id,
      label: t.label,
      custom: t.custom,
      logo,
      requiresBusiness: t.requiresBusiness,
      publishable: t.publishable,
      authConfigConfigured: Boolean(authConfigId),
      status: row ? (row.status as "ACTIVE" | "INITIATED" | "FAILED" | "EXPIRED" | "INACTIVE" | "REVOKED" | "INITIALIZING") : "not_connected",
      connectedAccountId: row?.connected_account_id ?? null,
      alias: row?.alias ?? null,
      connectedAt: row?.created_at ?? null,
      lastSyncAt: row?.last_sync_at ?? null
    };
  });
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let syncNote: string | null = null;
  if (isComposioConfigured()) {
    try {
      await syncConnectedAccounts();
    } catch (e) {
      // Keep the local snapshot if Composio is briefly unreachable. Surface
      // a short note so the operator can tell "everything is fine but live
      // sync timed out" from "everything is fine and live sync worked".
      const msg = e instanceof ComposioTimeoutError
        ? `Live sync timed out (${e.message}); showing last known snapshot.`
        : (e instanceof Error ? e.message : String(e));
      syncNote = `Live sync failed: ${msg}`;
    }
  }
  return NextResponse.json({
    configured: isComposioConfigured(),
    mode: isComposioConsumer() ? "consumer" : "project",
    toolkits: isComposioConsumer() ? [] : buildToolkitView(),
    ...(syncNote ? { syncNote } : {})
  });
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));

  // Save the API key.
  if (body.apiKey) {
    saveComposioApiKey(String(body.apiKey));
    return NextResponse.json({ ok: true });
  }

  // Add an operator-chosen toolkit from the catalog to the workspace.
  if (body.action === "addToolkit" && body.toolkit) {
    const list = addCustomToolkit(String(body.toolkit), body.label ? String(body.label) : undefined, body.logo ? String(body.logo) : null);
    return NextResponse.json({ ok: true, customToolkits: list });
  }

  // Remove an operator-chosen toolkit from the workspace.
  if (body.action === "removeToolkit" && body.toolkit) {
    const list = removeCustomToolkit(String(body.toolkit));
    return NextResponse.json({ ok: true, customToolkits: list });
  }

  // Save a per-toolkit auth config id.
  if (body.authConfigId && body.toolkit) {
    const meta = getToolkitMeta(String(body.toolkit));
    setAuthConfigId(meta.id, String(body.authConfigId));
    return NextResponse.json({ ok: true });
  }

  // Start a new OAuth connection.
  if (body.toolkit && body.action === "connect") {
    const meta = getToolkitMeta(String(body.toolkit));
    const authConfigId = getAuthConfigId(meta.id);
    // No pinned auth config id → let Composio create/attach a managed one on
    // the fly via toolkits.authorize(). This is what makes "connect any app
    // you searched for" work without the operator hand-entering an id.
    if (!authConfigId) {
      try {
        const { redirectUrl } = await authorizeToolkit(meta.id);
        return NextResponse.json({ redirectUrl, managed: true });
      } catch (e) {
        if (e instanceof ComposioAuthError) return NextResponse.json({ error: e.message }, { status: 400 });
        if (e instanceof ComposioTimeoutError) return NextResponse.json({ error: `Composio did not respond in time. ${e.message}` }, { status: 504 });
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ error: `Composio authorize failed: ${msg}` }, { status: 502 });
      }
    }
    let client;
    try { client = getComposio(); } catch (e) {
      if (e instanceof ComposioAuthError) {
        return NextResponse.json({ error: e.message }, { status: 400 });
      }
      throw e;
    }
    // Build the callback URL from the request's host. We need a public HTTPS
    // URL — DO App Platform serves the live URL over https.
    const url = new URL(req.url);
    const proto = req.headers.get("x-forwarded-proto") || url.protocol.replace(":", "");
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || url.host;
    const state = createOAuthState(meta.id);
    const callbackUrl = `${proto}://${host}/api/integrations/callback?toolkit=${encodeURIComponent(meta.id)}&state=${encodeURIComponent(state)}`;

    try {
      const link = await withTimeout(
        client.connectedAccounts.link(USER_ID, authConfigId, {
          callbackUrl,
          ...(body.alias ? { alias: String(body.alias) } : {})
        }),
        12_000,
        "connectedAccounts.link"
      );
      // The link response shape (verified at runtime against the installed
      // package): { redirectUrl: string }.
      const redirectUrl = (link as { redirectUrl?: string }).redirectUrl
        ?? (link as { redirect_url?: string }).redirect_url;
      if (!redirectUrl) {
        return NextResponse.json({ error: "Composio did not return a redirectUrl" }, { status: 502 });
      }
      return NextResponse.json({ redirectUrl });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (e instanceof ComposioUpstreamError) {
        return NextResponse.json({ error: `Composio upstream: ${msg}` }, { status: e.status });
      }
      if (e instanceof ComposioTimeoutError) {
        return NextResponse.json({ error: `Composio did not respond in time. ${msg}` }, { status: 504 });
      }
      return NextResponse.json({ error: `Composio call failed: ${msg}` }, { status: 502 });
    }
  }

  // Refresh a connected account's status from Composio.
  if (body.action === "refresh" && body.connectedAccountId) {
    const caId = String(body.connectedAccountId);
    let client;
    try { client = getComposio(); } catch (e) {
      if (e instanceof ComposioAuthError) return NextResponse.json({ error: e.message }, { status: 400 });
      throw e;
    }
    try {
      const r = await withTimeout(client.connectedAccounts.get(caId), 12_000, "connectedAccounts.get");
      const raw = JSON.stringify(r);
      const status = (r as { status?: string }).status ?? "ACTIVE";
      db.prepare(
        "UPDATE connected_accounts SET status=?, raw_json=?, last_sync_at=CURRENT_TIMESTAMP WHERE connected_account_id=?"
      ).run(status, raw, caId);
      return NextResponse.json({ ok: true, status, raw: r });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (e instanceof ComposioTimeoutError) {
        return NextResponse.json({ error: `Composio did not respond in time. ${msg}` }, { status: 504 });
      }
      return NextResponse.json({ error: `Composio get failed: ${msg}` }, { status: 502 });
    }
  }

  return NextResponse.json({ error: "Unknown action. Expected {apiKey} or {authConfigId, toolkit} or {toolkit, action: 'connect'} or {action: 'refresh', connectedAccountId}." }, { status: 400 });
}

export async function DELETE(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const caId = url.searchParams.get("connectedAccountId");
  if (!caId) return NextResponse.json({ error: "connectedAccountId is required" }, { status: 400 });

  // Try to remove on Composio first (best-effort — we still drop our row
  // even if Composio's delete fails, so the UI can clear).
  let upstreamOk = true;
  let upstreamError: string | null = null;
  try {
    const client = getComposio();
    await withTimeout(client.connectedAccounts.delete(caId), 12_000, "connectedAccounts.delete");
  } catch (e) {
    upstreamOk = false;
    upstreamError = e instanceof Error ? e.message : String(e);
  }
  db.prepare("DELETE FROM connected_accounts WHERE connected_account_id=?").run(caId);
  return NextResponse.json({ ok: true, upstreamOk, upstreamError });
}
