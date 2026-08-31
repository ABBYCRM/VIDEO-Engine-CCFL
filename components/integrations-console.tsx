"use client";
// 2026-08-30 "Claw only" repo strip: removed all direct-Instagram-Graph
// UI and state. The only integration surface left is Composio (the
// operator's chosen MCP for Reddit, Instagram, X, LinkedIn, GitHub,
// Gmail, Slack, Notion, etc.). Connect / disconnect / list toolkits /
// sync / configure auth configs all happen through Composio; the
// per-network connector state is just "Composio is configured and
// here are the toolkits the operator has connected."
import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Plug, Link as LinkIcon, Unlink, RefreshCcw, CircleCheck, CircleAlert, KeyRound, Save } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Toolkit = {
  id: string;
  label: string;
  status: "INITIALIZING" | "INITIATED" | "ACTIVE" | "FAILED" | "EXPIRED" | "INACTIVE" | "REVOKED" | "not_connected";
  connectedAccountId: string | null;
  alias: string | null;
  connectedAt: string | null;
  lastSyncAt: string | null;
  authConfigId: string | null;
};

type Overview = { configured: boolean; toolkits: Toolkit[] };

type Flash = { level: "success" | "failed" | "info"; msg: string };

export function IntegrationsConsole() {
  const params = useSearchParams();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [flash, setFlash] = useState<Flash | null>(null);
  const [composioKey, setComposioKey] = useState("");
  const [authConfigId, setAuthConfigId] = useState("");

  function pushFlash(level: Flash["level"], msg: string) {
    setFlash({ level, msg });
    setTimeout(() => setFlash(null), 4500);
  }

  const reload = useCallback(async () => {
    const r = await fetch("/api/integrations/composio", { cache: "no-store", credentials: "same-origin" });
    const d = await r.json().catch(() => null);
    if (r.ok && d) {
      setOverview({ configured: d.configured, toolkits: d.toolkits || [] });
    } else {
      // Fall back to the public health endpoint so the page can still
      // show "configured / not configured" without admin auth. The
      // toolkit list is empty in this case.
      try {
        const hr = await fetch("/api/health", { cache: "no-store" });
        if (hr.ok) {
          const hd = await hr.json();
          setOverview({ configured: !!hd?.checks?.composio?.configured, toolkits: [] });
        }
      } catch { /* leave overview null */ }
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => {
    const s = params.get("status");
    const t = params.get("toolkit");
    if (s === "success" && t) pushFlash("success", `${t} connected via Composio`);
    if (s === "failed") pushFlash("failed", `Composio OAuth failed${t ? ` for ${t}` : ""}`);
  }, [params]);

  async function saveComposioKey() {
    if (!composioKey.trim()) return;
    setBusy((b) => ({ ...b, _key: true }));
    try {
      const r = await fetch("/api/integrations/composio", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ apiKey: composioKey }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Save failed");
      pushFlash("success", "Composio API key saved");
      setComposioKey("");
      await reload();
    } catch (e) {
      pushFlash("failed", e instanceof Error ? e.message : String(e));
    } finally { setBusy((b) => ({ ...b, _key: false })); }
  }

  async function saveAuthConfig(toolkit: string) {
    if (!authConfigId.trim()) return;
    setBusy((b) => ({ ...b, [`auth_${toolkit}`]: true }));
    try {
      const r = await fetch("/api/integrations/composio", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ toolkit, authConfigId }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Save failed");
      pushFlash("success", `Auth config id saved for ${toolkit}`);
      setAuthConfigId("");
      await reload();
    } catch (e) {
      pushFlash("failed", e instanceof Error ? e.message : String(e));
    } finally { setBusy((b) => ({ ...b, [`auth_${toolkit}`]: false })); }
  }

  async function connect(toolkit: string) {
    setBusy((b) => ({ ...b, [`connect_${toolkit}`]: true }));
    try {
      const r = await fetch("/api/integrations/composio", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ toolkit, action: "connect" }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Connect failed");
      if (d.redirectUrl) {
        window.location.href = d.redirectUrl;
        return;
      }
      pushFlash("success", `${toolkit} connected`);
      await reload();
    } catch (e) {
      pushFlash("failed", e instanceof Error ? e.message : String(e));
    } finally { setBusy((b) => ({ ...b, [`connect_${toolkit}`]: false })); }
  }

  async function disconnect(connectedAccountId: string) {
    if (!confirm("Disconnect this account?")) return;
    setBusy((b) => ({ ...b, [`disconnect_${connectedAccountId}`]: true }));
    try {
      const r = await fetch(`/api/integrations/composio?connectedAccountId=${encodeURIComponent(connectedAccountId)}`, { method: "DELETE", credentials: "same-origin" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Disconnect failed");
      pushFlash("success", "Disconnected");
      await reload();
    } catch (e) {
      pushFlash("failed", e instanceof Error ? e.message : String(e));
    } finally { setBusy((b) => ({ ...b, [`disconnect_${connectedAccountId}`]: false })); }
  }

  async function refreshOne(connectedAccountId: string) {
    setBusy((b) => ({ ...b, [`refresh_${connectedAccountId}`]: true }));
    try {
      const r = await fetch("/api/integrations/composio", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ action: "refresh", connectedAccountId }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Refresh failed");
      pushFlash("success", `Status: ${d.status}`);
      await reload();
    } catch (e) {
      pushFlash("failed", e instanceof Error ? e.message : String(e));
    } finally { setBusy((b) => ({ ...b, [`refresh_${connectedAccountId}`]: false })); }
  }

  async function syncAll() {
    setBusy((b) => ({ ...b, _sync: true }));
    try {
      const r = await fetch("/api/integrations/composio/sync", { method: "POST", credentials: "same-origin" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Sync failed");
      pushFlash("success", `Synced ${d.synced ?? 0} account(s)`);
      await reload();
    } catch (e) {
      pushFlash("failed", e instanceof Error ? e.message : String(e));
    } finally { setBusy((b) => ({ ...b, _sync: false })); }
  }

  return (
    <div className="grid gap-4 px-4 py-4">
      {flash && (
        <div className={`rounded-xl border p-3 text-sm ${
          flash.level === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" :
          flash.level === "failed" ? "border-rose-200 bg-rose-50 text-rose-700" :
          "border-slate-200 bg-slate-50 text-slate-700"
        }`}>{flash.msg}</div>
      )}

      <Card>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-medium">
            <Plug size={18} className="text-violet-700" />
            Composio (single MCP for every external service)
          </div>
          <div className="flex items-center gap-2 text-sm">
            {overview?.configured ? (
              <span className="inline-flex items-center gap-1 text-emerald-700"><CircleCheck size={14}/> configured</span>
            ) : (
              <span className="inline-flex items-center gap-1 text-rose-700"><CircleAlert size={14}/> not configured</span>
            )}
            <Button variant="secondary" onClick={syncAll} disabled={busy._sync}>
              <RefreshCcw size={14} className="mr-1"/> {busy._sync ? "Syncing…" : "Sync accounts"}
            </Button>
          </div>
        </div>
        <p className="mb-4 text-sm text-slate-600">
          Composio is the operator's only MCP. From Claw, the <code className="rounded bg-slate-100 px-1">composio_action</code> tool
          accepts any toolkit's slug (REDDIT_*, INSTAGRAM_*, TWITTER_*, GITHUB_*, GMAIL_*, SLACK_*, NOTION_*, LINKEDIN_*, YOUTUBE_*, etc.) and the
          exact args dict the upstream tool expects. The response is the raw upstream payload, clipped to 6,000 chars.
        </p>
        <details className="mb-3">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">Set or rotate the Composio API key</summary>
          <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto]">
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-slate-700">Composio API key</span>
              <Input type="password" value={composioKey} onChange={e => setComposioKey(e.target.value)} placeholder="paste to set or rotate" />
            </label>
            <Button onClick={saveComposioKey} disabled={busy._key || !composioKey.trim()}>
              <Save size={14} className="mr-1"/> Save
            </Button>
          </div>
        </details>
      </Card>

      <Card>
        <div className="mb-3 flex items-center gap-2 font-medium">
          <LinkIcon size={18} className="text-violet-700" /> Connected toolkits
        </div>
        {!overview ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : overview.toolkits.length === 0 ? (
          <p className="text-sm text-slate-500">
            No active toolkits yet. Click "Connect" on a toolkit below to start the OAuth flow.
          </p>
        ) : (
          <div className="grid gap-3">
            {overview.toolkits.map((t) => (
              <ToolkitRow key={t.id} t={t} busy={busy} onConnect={connect} onDisconnect={disconnect} onRefresh={refreshOne} onSaveAuthConfig={saveAuthConfig} authConfigId={authConfigId} setAuthConfigId={setAuthConfigId} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function ToolkitRow({ t, busy, onConnect, onDisconnect, onRefresh, onSaveAuthConfig, authConfigId, setAuthConfigId }: {
  t: Toolkit;
  busy: Record<string, boolean>;
  onConnect: (id: string) => void;
  onDisconnect: (id: string) => void;
  onRefresh: (id: string) => void;
  onSaveAuthConfig: (id: string) => void;
  authConfigId: string;
  setAuthConfigId: (v: string) => void;
}) {
  const active = t.status === "ACTIVE" && t.connectedAccountId;
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="font-medium">{t.label}</div>
        <div className="flex items-center gap-2 text-sm">
          {active ? <span className="inline-flex items-center gap-1 text-emerald-700"><CircleCheck size={14}/> active</span>
                  : <span className="inline-flex items-center gap-1 text-rose-700"><CircleAlert size={14}/> {t.status}</span>}
        </div>
      </div>
      {t.alias && <div className="text-xs text-slate-500">alias: {t.alias}</div>}
      {t.connectedAccountId && <div className="text-xs text-slate-500">id: <code>{t.connectedAccountId}</code></div>}
      {t.lastSyncAt && <div className="text-xs text-slate-500">last sync: {t.lastSyncAt}</div>}
      <div className="mt-3 flex flex-wrap gap-2">
        {!active ? (
          <Button onClick={() => onConnect(t.id)} disabled={busy[`connect_${t.id}`]}>
            {busy[`connect_${t.id}`] ? "Connecting…" : <>Connect <KeyRound size={14} className="ml-1"/></>}
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={() => onRefresh(t.connectedAccountId!)} disabled={busy[`refresh_${t.connectedAccountId}`]}>
              {busy[`refresh_${t.connectedAccountId}`] ? "Refreshing…" : "Refresh status"}
            </Button>
            <Button variant="secondary" onClick={() => onDisconnect(t.connectedAccountId!)} disabled={busy[`disconnect_${t.connectedAccountId}`]}>
              {busy[`disconnect_${t.connectedAccountId}`] ? "Disconnecting…" : <><Unlink size={14} className="mr-1"/> Disconnect</>}
            </Button>
          </>
        )}
        <details className="w-full">
          <summary className="cursor-pointer text-xs text-slate-600">Save a custom auth config id for {t.id}</summary>
          <div className="mt-2 grid gap-2 md:grid-cols-[1fr_auto]">
            <Input value={authConfigId} onChange={e => setAuthConfigId(e.target.value)} placeholder="auth_config_id" />
            <Button onClick={() => onSaveAuthConfig(t.id)} disabled={busy[`auth_${t.id}`] || !authConfigId.trim()}>
              Save
            </Button>
          </div>
        </details>
      </div>
    </div>
  );
}
