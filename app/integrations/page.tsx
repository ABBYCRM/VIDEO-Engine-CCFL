"use client";
import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Plug, Link as LinkIcon, Unlink, RefreshCcw, CircleCheck, CircleAlert, KeyRound, ArrowRight, Save } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";

type Toolkit = {
  id: string;
  label: string;
  requiresBusiness: boolean;
  publishable: boolean;
  authConfigConfigured: boolean;
  status: "not_connected" | "INITIALIZING" | "INITIATED" | "ACTIVE" | "FAILED" | "EXPIRED" | "INACTIVE" | "REVOKED";
  connectedAccountId: string | null;
  alias: string | null;
  connectedAt: string | null;
  lastSyncAt: string | null;
};

type Overview = { configured: boolean; toolkits: Toolkit[] };

const FLASH_KEY = "video_engine_integration_flash";

function pushFlash(level: "success" | "failed", msg: string) {
  try { sessionStorage.setItem(FLASH_KEY, JSON.stringify({ level, msg, at: Date.now() })); } catch {}
}

function readFlash(): { level: "success" | "failed"; msg: string } | null {
  try {
    const raw = sessionStorage.getItem(FLASH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { level: "success" | "failed"; msg: string; at: number };
    if (Date.now() - parsed.at > 30_000) { sessionStorage.removeItem(FLASH_KEY); return null; }
    return { level: parsed.level, msg: parsed.msg };
  } catch { return null; }
}

function StatusDot({ state, label }: { state: "green" | "red" | "amber" | "grey"; label?: string }) {
  const color = state === "green" ? "#22c55e" : state === "red" ? "#ef4444" : state === "amber" ? "#f59e0b" : "#94a3b8";
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500">
      <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

export default function IntegrationsPage() {
  return (
    <AuthGuard>
      <AppShell>
        <Suspense fallback={<main className="mx-auto max-w-6xl px-4 py-8 text-slate-500">Loading…</main>}>
          <IntegrationsConsole />
        </Suspense>
      </AppShell>
    </AuthGuard>
  );
}

function IntegrationsConsole() {
  const sp = useSearchParams();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [composioKey, setComposioKey] = useState("");
  const [authConfigDraft, setAuthConfigDraft] = useState<Record<string, string>>({});
  const [flash, setFlash] = useState<{ level: "success" | "failed"; msg: string } | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const reload = useCallback(async () => {
    const r = await fetch("/api/integrations/composio");
    if (r.ok) setOverview(await r.json());
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // Handle ?connected=... flash from the OAuth callback
  useEffect(() => {
    const c = sp.get("connected");
    const toolkit = sp.get("toolkit") || "";
    if (c === "success") {
      pushFlash("success", `${toolkit} connected`);
    } else if (c === "failed") {
      const reason = sp.get("reason") || "OAuth was cancelled or the provider rejected the request";
      pushFlash("failed", `${toolkit} failed: ${reason.slice(0, 200)}`);
    }
    if (c) {
      const url = new URL(window.location.href);
      url.searchParams.delete("connected");
      url.searchParams.delete("toolkit");
      url.searchParams.delete("reason");
      url.searchParams.delete("ca");
      url.searchParams.delete("status");
      window.history.replaceState({}, "", url.toString());
      reload();
    }
  }, [sp, reload]);

  useEffect(() => {
    setFlash(readFlash());
    const t = setTimeout(() => {
      setFlash(null);
      try { sessionStorage.removeItem(FLASH_KEY); } catch {}
    }, 6000);
    return () => clearTimeout(t);
  }, [overview]);

  async function saveComposioKey() {
    if (!composioKey) return;
    setBusy(b => ({ ...b, _key: true }));
    try {
      await fetch("/api/integrations/composio", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ apiKey: composioKey }) });
      setComposioKey("");
      await reload();
    } finally { setBusy(b => ({ ...b, _key: false })); }
  }

  async function saveAuthConfigId(toolkit: string) {
    const id = authConfigDraft[toolkit];
    if (!id) return;
    setBusy(b => ({ ...b, [toolkit]: true }));
    try {
      await fetch("/api/integrations/composio", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ toolkit, authConfigId: id }) });
      setAuthConfigDraft(d => ({ ...d, [toolkit]: "" }));
      await reload();
    } finally { setBusy(b => ({ ...b, [toolkit]: false })); }
  }

  async function connectToolkit(toolkit: string) {
    setBusy(b => ({ ...b, [toolkit]: true }));
    try {
      const r = await fetch("/api/integrations/composio", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ toolkit, action: "connect" }) });
      const d = await r.json();
      if (d.error) {
        pushFlash("failed", d.error);
        setFlash({ level: "failed", msg: d.error });
        return;
      }
      if (d.redirectUrl) {
        window.location.href = d.redirectUrl;
      }
    } finally { setBusy(b => ({ ...b, [toolkit]: false })); }
  }

  async function disconnectToolkit(connectedAccountId: string, label: string) {
    if (!confirm(`Disconnect ${label}? You can re-connect at any time.`)) return;
    setBusy(b => ({ ...b, [connectedAccountId]: true }));
    try {
      await fetch(`/api/integrations/composio?connectedAccountId=${encodeURIComponent(connectedAccountId)}`, { method: "DELETE" });
      await reload();
    } finally { setBusy(b => ({ ...b, [connectedAccountId]: false })); }
  }

  async function refreshStatus(connectedAccountId: string) {
    setBusy(b => ({ ...b, [connectedAccountId]: true }));
    try {
      await fetch("/api/integrations/composio", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "refresh", connectedAccountId }) });
      await reload();
    } finally { setBusy(b => ({ ...b, [connectedAccountId]: false })); }
  }

  async function syncFromComposio() {
    setBusy(b => ({ ...b, _sync: true }));
    try {
      const r = await fetch("/api/integrations/composio/sync", { method: "POST" });
      const d = await r.json();
      if (d.error) {
        pushFlash("failed", d.error);
        setFlash({ level: "failed", msg: d.error });
      } else {
        pushFlash("success", `Mirrored ${d.mirrored} account${d.mirrored === 1 ? "" : "s"} from Composio`);
        setFlash({ level: "success", msg: `Mirrored ${d.mirrored} account${d.mirrored === 1 ? "" : "s"} from Composio` });
        await reload();
      }
    } finally { setBusy(b => ({ ...b, _sync: false })); }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
          <div className="mb-6 flex flex-col gap-2">
            <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
              <Plug size={22} className="text-cyan-700" />
              Integrations
            </h1>
            <p className="max-w-3xl text-slate-600">
              Real OAuth via Composio. Set your Composio API key, paste the per-toolkit auth-config id from your Composio dashboard, and the
              Connect button round-trips the user through the provider and back to this page. Tokens never pass through this app — only the
              connected-account id.
            </p>
          </div>

          {flash && (
            <div className={`mb-4 flex items-start gap-2 rounded-xl border p-3 text-sm ${
              flash.level === "success"
                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200"
                : "border-rose-500/40 bg-rose-500/10 text-rose-600"
            }`}>
              {flash.level === "success" ? <CircleCheck size={16} className="mt-0.5" /> : <CircleAlert size={16} className="mt-0.5" />}
              <span>{flash.msg}</span>
            </div>
          )}

          <Card className="mb-6 p-5">
            <div className="mb-3 flex items-center gap-2 font-medium">
              <KeyRound size={18} className="text-cyan-700" />
              Composio project API key
            </div>
            <p className="mb-3 text-sm text-slate-600">
              The key from <a className="text-cyan-700 underline-offset-2 hover:underline" href="https://app.composio.dev" target="_blank" rel="noreferrer">app.composio.dev</a>{" "}
              → Settings → API Keys. Stored encrypted (AES-256-GCM). The "Re-check live status" dot in the next card confirms the key is valid.
            </p>
            <div className="flex gap-2">
              <Input
                type="password"
                value={composioKey}
                onChange={e => setComposioKey(e.target.value)}
                placeholder={overview?.configured ? "•••••••••••  (key is saved — paste to replace)" : "ak_…"}
              />
              <Button onClick={saveComposioKey} disabled={!composioKey || busy._key}>
                <Save size={14} className="mr-1" />Save
              </Button>
            </div>
          </Card>

          {!overview ? (
            <div className="p-8 text-slate-500">Loading…</div>
          ) : (
            <Card className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <div className="font-medium">Connected tools</div>
                <div className="flex items-center gap-2">
                  {overview.configured && (
                    <Button variant="secondary" size="sm" onClick={syncFromComposio} disabled={busy._sync}>
                      <RefreshCcw size={14} className={`mr-1 ${busy._sync ? "animate-spin" : ""}`} />Sync from Composio
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={reload}>
                    <RefreshCcw size={14} className="mr-1" />Refresh
                  </Button>
                </div>
              </div>

              {!overview.configured && (
                <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-50 p-3 text-sm text-amber-800">
                  Set your Composio API key above to enable connections.
                </div>
              )}

              <div className="grid gap-3">
                {overview.toolkits.map(t => {
                  const state: "green" | "red" | "amber" | "grey" =
                    t.status === "ACTIVE" ? "green"
                    : t.status === "not_connected" ? "grey"
                    : t.status === "INITIATED" || t.status === "INITIALIZING" ? "amber"
                    : t.status === "FAILED" || t.status === "EXPIRED" || t.status === "REVOKED" || t.status === "INACTIVE" ? "red"
                    : "amber";
                  const stateLabel =
                    t.status === "ACTIVE" ? "connected"
                    : t.status === "not_connected" ? "not connected"
                    : t.status === "INITIATED" ? "in progress"
                    : t.status === "INITIALIZING" ? "initializing"
                    : t.status === "FAILED" ? "failed"
                    : t.status === "EXPIRED" ? "expired"
                    : t.status === "REVOKED" ? "revoked"
                    : t.status === "INACTIVE" ? "inactive"
                    : t.status;
                  const canConnect = overview.configured && t.authConfigConfigured;
                  return (
                    <div key={t.id} className="grid gap-3 rounded-xl border border-slate-200 bg-white/70 p-4 md:grid-cols-[1.4fr_1fr]">
                      <div>
                        <div className="flex items-center gap-2">
                          <div className="font-medium">{t.label}</div>
                          <StatusDot state={state} label={stateLabel} />
                          {t.requiresBusiness && <span className="rounded-full border border-amber-500/40 bg-amber-50 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-800">Business / Creator</span>}
                          {t.publishable && <span className="rounded-full border border-violet-300 bg-violet-50 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-cyan-700">publishable</span>}
                        </div>
                        {t.connectedAccountId && (
                          <div className="mt-1 text-[11px] text-slate-500">
                            connected_account_id: <code className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-800">{t.connectedAccountId}</code>
                            {t.lastSyncAt ? ` · last sync ${new Date(t.lastSyncAt).toLocaleString()}` : ""}
                          </div>
                        )}
                        <div className="mt-3 flex flex-wrap gap-2">
                          {t.status === "ACTIVE" ? (
                            <>
                              <Button variant="secondary" size="sm" onClick={() => refreshStatus(t.connectedAccountId!)} disabled={busy[t.connectedAccountId!]}>
                                <RefreshCcw size={14} className="mr-1" />Check status
                              </Button>
                              <Button variant="danger" size="sm" onClick={() => disconnectToolkit(t.connectedAccountId!, t.label)} disabled={busy[t.connectedAccountId!]}>
                                <Unlink size={14} className="mr-1" />Disconnect
                              </Button>
                            </>
                          ) : (
                            <Button onClick={() => connectToolkit(t.id)} disabled={!canConnect || busy[t.id]}>
                              {busy[t.id] ? <><RefreshCcw size={14} className="mr-1 animate-spin" />Starting…</> : <><LinkIcon size={14} className="mr-1" />Connect <ArrowRight size={14} className="ml-1" /></>}
                            </Button>
                          )}
                        </div>
                        {!canConnect && (
                          <div className="mt-2 text-[11px] text-slate-500">
                            {!overview.configured
                              ? "Set the Composio API key above to enable."
                              : "Set the auth config id for this toolkit (right side) to enable."}
                          </div>
                        )}
                      </div>
                      <div className="grid gap-2 text-sm">
                        <span className="text-slate-500">Auth config id (from Composio dashboard)</span>
                        <Input
                          value={authConfigDraft[t.id] ?? ""}
                          onChange={e => setAuthConfigDraft(d => ({ ...d, [t.id]: e.target.value }))}
                          placeholder={t.authConfigConfigured ? "ac_… (saved — paste to replace)" : "ac_…"}
                        />
                        <Button variant="secondary" size="sm" onClick={() => saveAuthConfigId(t.id)} disabled={!authConfigDraft[t.id] || busy[t.id]}>
                          Save auth config
                        </Button>
                        {t.authConfigConfigured && (
                          <div className="text-[11px] text-slate-500">Saved · pastes will replace.</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </main>
  );
}
