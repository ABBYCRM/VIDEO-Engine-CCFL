"use client";
// Composio settings console.
//
// The operator configures Composio here end-to-end:
//   1. Set / rotate the Composio API key.
//   2. Search Composio's full app catalog and ADD any app to the workspace.
//   3. CONNECT an added app via OAuth (Composio creates a managed auth
//      config on the fly when none is pinned).
//   4. Manage connected accounts: refresh status, disconnect, or pin a
//      custom auth config id.
//
// Everything routes through /api/integrations/composio(/catalog|/sync).
import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import {
  Plug, Link as LinkIcon, Unlink, RefreshCcw, CircleCheck, CircleAlert,
  KeyRound, Save, Search, Plus, Loader2, Trash2, X, Blocks
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Toolkit = {
  id: string;
  label: string;
  custom?: boolean;
  logo?: string | null;
  status: "INITIALIZING" | "INITIATED" | "ACTIVE" | "FAILED" | "EXPIRED" | "INACTIVE" | "REVOKED" | "not_connected";
  connectedAccountId: string | null;
  alias: string | null;
  connectedAt: string | null;
  lastSyncAt: string | null;
  authConfigId: string | null;
};

type Overview = { configured: boolean; toolkits: Toolkit[] };
type CatalogItem = { slug: string; name: string; logo: string | null; description: string | null; categories: string[]; toolsCount: number | null };
type Flash = { level: "success" | "failed" | "info"; msg: string };

export function IntegrationsConsole() {
  const params = useSearchParams();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [flash, setFlash] = useState<Flash | null>(null);
  const [composioKey, setComposioKey] = useState("");
  const [authConfigId, setAuthConfigId] = useState("");

  // Catalog search state.
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const searchBox = useRef<HTMLDivElement>(null);

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
    const s = params.get("connected");
    const t = params.get("toolkit");
    if (s === "success" && t) pushFlash("success", `${t} connected via Composio`);
    if (s === "failed") pushFlash("failed", `Composio OAuth failed${t ? ` for ${t}` : ""}`);
  }, [params]);

  // Debounced catalog search.
  useEffect(() => {
    if (!open) return;
    let active = true;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(`/api/integrations/composio/catalog?q=${encodeURIComponent(query)}`, { cache: "no-store", credentials: "same-origin" });
        const d = await r.json().catch(() => null);
        if (!active) return;
        if (r.ok && d?.items) setResults(d.items);
        else setResults([]);
      } finally {
        if (active) setSearching(false);
      }
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [query, open]);

  // Close the dropdown on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (searchBox.current && !searchBox.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

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

  async function addToolkit(item: CatalogItem) {
    setBusy((b) => ({ ...b, [`add_${item.slug}`]: true }));
    try {
      const r = await fetch("/api/integrations/composio", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ action: "addToolkit", toolkit: item.slug, label: item.name, logo: item.logo }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Add failed");
      pushFlash("success", `${item.name} added to your toolkit`);
      setOpen(false);
      setQuery("");
      await reload();
    } catch (e) {
      pushFlash("failed", e instanceof Error ? e.message : String(e));
    } finally { setBusy((b) => ({ ...b, [`add_${item.slug}`]: false })); }
  }

  async function removeToolkit(slug: string) {
    setBusy((b) => ({ ...b, [`remove_${slug}`]: true }));
    try {
      const r = await fetch("/api/integrations/composio", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ action: "removeToolkit", toolkit: slug }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Remove failed");
      pushFlash("info", `${slug} removed`);
      await reload();
    } catch (e) {
      pushFlash("failed", e instanceof Error ? e.message : String(e));
    } finally { setBusy((b) => ({ ...b, [`remove_${slug}`]: false })); }
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
      if (d.redirectUrl) { window.location.href = d.redirectUrl; return; }
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
      pushFlash("success", `Synced ${d.mirrored ?? 0} account(s)`);
      await reload();
    } catch (e) {
      pushFlash("failed", e instanceof Error ? e.message : String(e));
    } finally { setBusy((b) => ({ ...b, _sync: false })); }
  }

  const addedSlugs = new Set((overview?.toolkits ?? []).map((t) => t.id));

  return (
    <div className="grid gap-4 px-4 py-4">
      {flash && (
        <div className={`rounded-xl border p-3 text-sm ${
          flash.level === "success" ? "border-[hsl(var(--success))]/30 bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]" :
          flash.level === "failed" ? "border-[hsl(var(--danger))]/30 bg-[hsl(var(--danger))]/10 text-[hsl(var(--danger))]" :
          "border-border bg-muted text-muted-foreground"
        }`}>{flash.msg}</div>
      )}

      {/* Status + API key */}
      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-medium">
            <Plug size={18} className="text-[hsl(var(--claw-accent))]" />
            Composio
          </div>
          <div className="flex items-center gap-2 text-sm">
            {overview?.configured ? (
              <span className="inline-flex items-center gap-1 text-[hsl(var(--success))]"><CircleCheck size={14}/> configured</span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[hsl(var(--danger))]"><CircleAlert size={14}/> not configured</span>
            )}
            <Button variant="secondary" size="sm" onClick={syncAll} disabled={busy._sync}>
              <RefreshCcw size={14} className="mr-1"/> {busy._sync ? "Syncing…" : "Sync"}
            </Button>
          </div>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Composio is the operator&apos;s single MCP for every external service. Search the full
          catalog below, add the apps you want, then connect each one with OAuth.
        </p>
        <details className="group">
          <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium text-foreground">
            <KeyRound size={14} className="text-muted-foreground" /> Set or rotate the Composio API key
          </summary>
          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
            <Input type="password" value={composioKey} onChange={e => setComposioKey(e.target.value)} placeholder="paste to set or rotate" />
            <Button onClick={saveComposioKey} disabled={busy._key || !composioKey.trim()}>
              <Save size={14} className="mr-1"/> {busy._key ? "Saving…" : "Save"}
            </Button>
          </div>
        </details>
      </Card>

      {/* Add a toolkit — searchable catalog */}
      <Card>
        <div className="mb-1 flex items-center gap-2 font-medium">
          <Blocks size={18} className="text-[hsl(var(--claw-accent))]" /> Add a toolkit
        </div>
        <p className="mb-3 text-sm text-muted-foreground">
          Search Composio&apos;s app catalog and add any app to your workspace.
        </p>
        <div className="relative" ref={searchBox}>
          <div className="flex items-center gap-2 rounded-xl border border-border bg-[hsl(var(--claw-elevated))] px-3 focus-within:border-[hsl(var(--claw-accent))]/50 focus-within:ring-2 focus-within:ring-[hsl(var(--claw-accent))]/40">
            <Search size={16} className="shrink-0 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
              onFocus={() => setOpen(true)}
              disabled={!overview?.configured}
              placeholder={overview?.configured ? "Search apps — Slack, Notion, Reddit, HubSpot…" : "Set the Composio API key first"}
              className="h-11 w-full min-w-0 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
              aria-label="Search Composio app catalog"
            />
            {searching && <Loader2 size={16} className="shrink-0 animate-spin text-muted-foreground" />}
            {query && !searching && (
              <button type="button" onClick={() => { setQuery(""); }} className="shrink-0 text-muted-foreground hover:text-foreground" aria-label="Clear search">
                <X size={16} />
              </button>
            )}
          </div>

          {open && overview?.configured && (
            <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 max-h-80 overflow-y-auto rounded-xl border border-border bg-[hsl(var(--popover))] p-1 shadow-xl">
              {searching && results.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">Searching…</div>
              ) : results.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">No apps match &ldquo;{query}&rdquo;</div>
              ) : (
                results.map((item) => {
                  const added = addedSlugs.has(item.slug);
                  return (
                    <button
                      key={item.slug}
                      type="button"
                      disabled={added || busy[`add_${item.slug}`]}
                      onClick={() => addToolkit(item)}
                      className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted disabled:opacity-60"
                    >
                      <ToolkitIcon logo={item.logo} name={item.name} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-foreground">{item.name}</span>
                          {typeof item.toolsCount === "number" && (
                            <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{item.toolsCount} tools</span>
                          )}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">{item.slug}{item.categories[0] ? ` · ${item.categories[0]}` : ""}</span>
                      </span>
                      {added ? (
                        <span className="inline-flex shrink-0 items-center gap-1 text-xs text-[hsl(var(--success))]"><CircleCheck size={13} /> added</span>
                      ) : busy[`add_${item.slug}`] ? (
                        <Loader2 size={15} className="shrink-0 animate-spin text-muted-foreground" />
                      ) : (
                        <Plus size={15} className="shrink-0 text-[hsl(var(--claw-accent))]" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Your toolkits */}
      <Card>
        <div className="mb-3 flex items-center gap-2 font-medium">
          <LinkIcon size={18} className="text-[hsl(var(--claw-accent))]" /> Your toolkits
        </div>
        {!overview ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : overview.toolkits.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No toolkits yet. Search the catalog above and add the apps you want to connect.
          </p>
        ) : (
          <div className="grid gap-3">
            {overview.toolkits.map((t) => (
              <ToolkitRow key={t.id} t={t} busy={busy} onConnect={connect} onDisconnect={disconnect} onRefresh={refreshOne} onRemove={removeToolkit} onSaveAuthConfig={saveAuthConfig} authConfigId={authConfigId} setAuthConfigId={setAuthConfigId} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function ToolkitIcon({ logo, name }: { logo: string | null; name: string }) {
  if (logo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logo || "/placeholder.svg"} alt="" width={28} height={28} className="h-7 w-7 shrink-0 rounded-md object-contain" crossOrigin="anonymous" />;
  }
  return (
    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function ToolkitRow({ t, busy, onConnect, onDisconnect, onRefresh, onRemove, onSaveAuthConfig, authConfigId, setAuthConfigId }: {
  t: Toolkit;
  busy: Record<string, boolean>;
  onConnect: (id: string) => void;
  onDisconnect: (id: string) => void;
  onRefresh: (id: string) => void;
  onRemove: (id: string) => void;
  onSaveAuthConfig: (id: string) => void;
  authConfigId: string;
  setAuthConfigId: (v: string) => void;
}) {
  const active = t.status === "ACTIVE" && t.connectedAccountId;
  return (
    <div className="rounded-xl border border-border bg-[hsl(var(--claw-elevated))] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <ToolkitIcon logo={t.logo ?? null} name={t.label} />
          <div className="min-w-0">
            <div className="truncate font-medium text-foreground">{t.label}</div>
            <div className="truncate text-xs text-muted-foreground">{t.id}</div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1 text-xs">
          {active ? <span className="inline-flex items-center gap-1 text-[hsl(var(--success))]"><CircleCheck size={13}/> active</span>
                  : <span className="inline-flex items-center gap-1 whitespace-nowrap text-muted-foreground"><CircleAlert size={13}/> {t.status === "not_connected" ? "not connected" : t.status.toLowerCase()}</span>}
        </div>
      </div>
      {t.alias && <div className="text-xs text-muted-foreground">alias: {t.alias}</div>}
      {t.lastSyncAt && <div className="text-xs text-muted-foreground">last sync: {t.lastSyncAt}</div>}
      <div className="mt-3 flex flex-wrap gap-2">
        {!active ? (
          <Button size="sm" onClick={() => onConnect(t.id)} disabled={busy[`connect_${t.id}`]}>
            {busy[`connect_${t.id}`] ? "Connecting…" : <>Connect <KeyRound size={14} className="ml-1"/></>}
          </Button>
        ) : (
          <>
            <Button variant="secondary" size="sm" onClick={() => onRefresh(t.connectedAccountId!)} disabled={busy[`refresh_${t.connectedAccountId}`]}>
              {busy[`refresh_${t.connectedAccountId}`] ? "Refreshing…" : "Refresh"}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => onDisconnect(t.connectedAccountId!)} disabled={busy[`disconnect_${t.connectedAccountId}`]}>
              {busy[`disconnect_${t.connectedAccountId}`] ? "Disconnecting…" : <><Unlink size={14} className="mr-1"/> Disconnect</>}
            </Button>
          </>
        )}
        {t.custom && !active && (
          <Button variant="danger" size="sm" onClick={() => onRemove(t.id)} disabled={busy[`remove_${t.id}`]}>
            <Trash2 size={14} className="mr-1"/> {busy[`remove_${t.id}`] ? "Removing…" : "Remove"}
          </Button>
        )}
        <details className="w-full">
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">Advanced: pin a custom auth config id</summary>
          <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
            <Input value={authConfigId} onChange={e => setAuthConfigId(e.target.value)} placeholder="auth_config_id" />
            <Button variant="secondary" size="sm" onClick={() => onSaveAuthConfig(t.id)} disabled={busy[`auth_${t.id}`] || !authConfigId.trim()}>
              Save
            </Button>
          </div>
        </details>
      </div>
    </div>
  );
}
