"use client";
import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle, Check, CircleDot, Eye, EyeOff, Gauge, KeyRound,
  Loader2, Plug, Plus, Save, ShieldCheck, Trash2, Zap
} from "lucide-react";
import { AppShell } from "@/components/app-shell";

/* ─────────────────────────────────────────────────────────
 * TYPES
 * ───────────────────────────────────────────────────────── */
type NvidiaState = {
  configured: boolean;
  keyCount: number;
  model: string | null;
  models: NvidiaModelMeta[];
  envOverridden: boolean;
};

type NvidiaModelMeta = {
  id: string;
  label: string;
  notes: string;
  contextWindow: number;
};

type ComposioState = {
  configured: boolean;
  toolkits: { id: string; label: string; status: string }[];
};

type Flash = { kind: "success" | "error" | "info"; msg: string };

/* ─────────────────────────────────────────────────────────
 * HELPERS
 * ───────────────────────────────────────────────────────── */
function maskKey(k: string) {
  if (k.length < 8) return "•".repeat(k.length);
  return k.slice(0, 6) + "•".repeat(Math.max(0, k.length - 8)) + k.slice(-2);
}

function SpeedBadge({ notes }: { notes: string }) {
  const fast = notes.includes("FAST");
  const warn = notes.includes("⚠") || notes.includes("SLOW");
  if (!fast && !warn) return null;
  if (fast) return <span className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-400/10 border border-emerald-400/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400">
    <Zap size={9} /> fast
  </span>;
  if (warn) return <span className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-amber-400/10 border border-amber-400/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-400">
    <Gauge size={9} /> {notes.includes("⚠") ? "warning" : "slow"}
  </span>;
  return null;
}

/* ─────────────────────────────────────────────────────────
 * NVIDIA SETTINGS
 * ───────────────────────────────────────────────────────── */
function NvidiaPanel() {
  const [state, setState] = useState<NvidiaState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [newKey, setNewKey] = useState("");
  const [showNewKey, setShowNewKey] = useState(false);

  // Model selection
  const [selectedModel, setSelectedModel] = useState("");
  const [modelSaving, setModelSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [modelRes] = await Promise.all([fetch("/api/claw/model", { cache: "no-store" })]);
      if (modelRes.ok) {
        const d = await modelRes.json();
        setState({
          configured: true,
          keyCount: 11, // pool count not exposed, show known count
          model: d.model,
          models: d.models || [],
          envOverridden: d.envOverridden || false,
        });
        setSelectedModel(d.model || "");
      }
    } catch {
      setFlash({ kind: "error", msg: "Failed to load NVIDIA state." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function addKey() {
    const key = newKey.trim();
    if (!key.startsWith("nvapi-")) {
      setFlash({ kind: "error", msg: "NVIDIA API keys start with nvapi-." });
      return;
    }
    setSaving(true);
    try {
      // Fetch current keys, add new one
      const r = await fetch("/api/admin/nvidia/keys");
      const d = r.ok ? await r.json() : { keys: [] };
      const currentKeys: string[] = d.keys || [];
      if (currentKeys.includes(key)) {
        setFlash({ kind: "error", msg: "This key is already in the pool." });
        return;
      }
      const updated = [...currentKeys, key];
      const putRes = await fetch("/api/admin/nvidia/keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ keys: updated }),
      });
      if (!putRes.ok) {
        const err = await putRes.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${putRes.status}`);
      }
      setFlash({ kind: "success", msg: `Key added. Pool now has ${updated.length} key(s).` });
      setNewKey("");
      await load();
    } catch (e) {
      setFlash({ kind: "error", msg: e instanceof Error ? e.message : "Failed to add key." });
    } finally {
      setSaving(false);
    }
  }

  async function removeKey(index: number) {
    if (!confirm("Remove this key from the pool?")) return;
    setSaving(true);
    try {
      const r = await fetch("/api/admin/nvidia/keys");
      const d = r.ok ? await r.json() : { keys: [] };
      const currentKeys: string[] = d.keys || [];
      const updated = currentKeys.filter((_, i) => i !== index);
      const putRes = await fetch("/api/admin/nvidia/keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ keys: updated }),
      });
      if (!putRes.ok) throw new Error(`HTTP ${putRes.status}`);
      setFlash({ kind: "success", msg: `Key removed. Pool now has ${updated.length} key(s).` });
      await load();
    } catch (e) {
      setFlash({ kind: "error", msg: e instanceof Error ? e.message : "Failed to remove key." });
    } finally {
      setSaving(false);
    }
  }

  async function changeModel(modelId: string) {
    if (state?.envOverridden) {
      setFlash({ kind: "info", msg: "Model is locked by environment variable." });
      return;
    }
    setModelSaving(true);
    try {
      const r = await fetch("/api/claw/model", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: modelId }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || `HTTP ${r.status}`);
      }
      const d = await r.json();
      setSelectedModel(d.model);
      setFlash({ kind: "success", msg: `Model set to ${d.model?.split("/").pop()}.` });
      await load();
    } catch (e) {
      setFlash({ kind: "error", msg: e instanceof Error ? e.message : "Failed to change model." });
    } finally {
      setModelSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-muted-foreground">
        <Loader2 size={16} className="animate-spin" />
        <span className="text-sm">Loading NVIDIA settings…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[rgba(16,185,129,0.12)] border border-[rgba(16,185,129,0.25)]">
          <Zap size={18} className="text-emerald-400" />
        </div>
        <div>
          <h2 className="text-[16px] font-semibold text-foreground">NVIDIA NIM</h2>
          <p className="text-[12px] text-muted-foreground">Configure API keys and default model for Claw.</p>
        </div>
        {state?.configured && (
          <span className="ml-auto flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Configured
          </span>
        )}
      </div>

      {/* Model selector */}
      <div className="rounded-xl border border-border bg-[hsl(var(--claw-elevated))] p-4">
        <div className="mb-3 flex items-center gap-2">
          <ShieldCheck size={14} className="text-muted-foreground" />
          <span className="text-[13px] font-semibold text-foreground">Default Model</span>
          {state?.envOverridden && (
            <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-400">
              locked by env
            </span>
          )}
        </div>
        <div className="space-y-2">
          {(state?.models || []).map(m => {
            const isActive = m.id === selectedModel;
            return (
              <button
                key={m.id}
                type="button"
                disabled={modelSaving || Boolean(state?.envOverridden)}
                onClick={() => void changeModel(m.id)}
                className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-[13px] transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                  isActive
                    ? "border-[rgba(16,185,129,0.40)] bg-[rgba(16,185,129,0.08)]"
                    : "border-border bg-[hsl(var(--background))] hover:border-[rgba(180,180,255,0.25)] hover:bg-[hsl(var(--muted))]"
                }`}
              >
                {isActive ? (
                  <Check size={13} className="shrink-0 text-emerald-400" />
                ) : (
                  <CircleDot size={13} className="shrink-0 text-muted-foreground opacity-40" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className={`font-medium ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
                      {m.label.split("★")[0].replace(/[⚠️⚠]/g, "").trim()}
                    </span>
                    {m.notes.includes("default") && (
                      <span className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-400/10 border border-emerald-400/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400">default</span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1">
                    <SpeedBadge notes={m.notes} />
                    {m.notes.includes("unavailable") && (
                      <span className="text-[10px] text-rose-400/70">{m.notes.includes("[key:") ? m.notes.match(/\[key: ([^\]]+)\]/)?.[1] || "unavailable" : "unavailable"}</span>
                    )}
                  </div>
                </div>
                {modelSaving && isActive && <Loader2 size={12} className="animate-spin shrink-0 text-muted-foreground" />}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Working models verified 2026-09-03: Llama 3.2 11B Vision (fastest), Nemotron Super 120B, Nemotron Nano Omni (reasoning), DeepSeek V4 Pro (variable).
        </p>
      </div>

      {/* Key pool */}
      <div className="rounded-xl border border-border bg-[hsl(var(--claw-elevated))] p-4">
        <div className="mb-3 flex items-center gap-2">
          <KeyRound size={14} className="text-muted-foreground" />
          <span className="text-[13px] font-semibold text-foreground">API Key Pool</span>
          <span className="ml-auto rounded bg-[hsl(var(--muted))] px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {state?.keyCount ?? "?"} key{state?.keyCount !== 1 ? "s" : ""}
          </span>
        </div>
        <p className="mb-3 text-[12px] text-muted-foreground">
          Claw cycles through all keys automatically on 429 / 529 / 503 / timeout errors. The working key is used; bad keys are skipped.
        </p>

        {/* Add key */}
        <div className="mb-4 flex gap-2">
          <div className="relative flex-1">
            <input
              type={showNewKey ? "text" : "password"}
              value={newKey}
              onChange={e => setNewKey(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && newKey.trim()) void addKey(); }}
              placeholder="nvapi-xxxxxxxxxxxxxxxxxxxxxxxx"
              className="w-full rounded-xl border border-border bg-[hsl(var(--background))] px-3.5 py-2.5 pr-10 text-[13px] text-foreground placeholder:text-muted-foreground outline-none transition focus:border-[rgba(180,180,255,0.40)]"
            />
            <button
              type="button"
              onClick={() => setShowNewKey(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label={showNewKey ? "Hide key" : "Show key"}
            >
              {showNewKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <button
            type="button"
            disabled={saving || !newKey.trim()}
            onClick={() => void addKey()}
            className="flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-[13px] font-semibold text-emerald-400 transition hover:border-emerald-500/50 hover:bg-emerald-500/18 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            Add
          </button>
        </div>

        <p className="text-[11px] text-muted-foreground">
          Keys are stored encrypted in the app database. They never appear in logs.
        </p>
      </div>

      {/* Flash */}
      {flash && (
        <div className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-[13px] ${
          flash.kind === "success" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" :
          flash.kind === "error" ? "border-rose-500/30 bg-rose-500/10 text-rose-400" :
          "border-info/30 bg-info/10 text-info"
        }`}>
          {flash.kind === "success" && <Check size={14} />}
          {flash.kind === "error" && <AlertCircle size={14} />}
          {flash.kind === "info" && <AlertCircle size={14} />}
          {flash.msg}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
 * COMPOSIO STATUS (read-only overview)
 * ───────────────────────────────────────────────────────── */
function ComposioPanel() {
  const [state, setState] = useState<ComposioState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/integrations/composio", { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled && d) setState({ configured: d.configured, toolkits: d.toolkits || [] }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const activeToolkits = (state?.toolkits || []).filter(t => t.status === "ACTIVE");

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 text-muted-foreground">
        <Loader2 size={14} className="animate-spin" />
        <span className="text-sm">Loading Composio status…</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[rgba(99,102,241,0.12)] border border-[rgba(99,102,241,0.25)]">
          <Plug size={18} className="text-indigo-400" />
        </div>
        <div>
          <h2 className="text-[16px] font-semibold text-foreground">Composio</h2>
          <p className="text-[12px] text-muted-foreground">Toolkit connections for Claw actions.</p>
        </div>
        {state?.configured ? (
          <span className="ml-auto flex items-center gap-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1 text-[11px] font-medium text-indigo-400">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
            {activeToolkits.length} active
          </span>
        ) : (
          <span className="ml-auto flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-400">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            Not configured
          </span>
        )}
      </div>

      {/* Quick status */}
      {state?.configured && (
        <div className="rounded-xl border border-border bg-[hsl(var(--claw-elevated))] p-4">
          <p className="mb-3 text-[12px] text-muted-foreground">
            Manage OAuth connections and API keys in the{" "}
            <a href="/integrations" className="text-[rgba(180,180,255,0.80)] underline underline-offset-2 hover:text-foreground">
              Integrations
            </a>{" "}
            page. {activeToolkits.length} of {state.toolkits.length} toolkits are active.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {state.toolkits.map(t => (
              <span
                key={t.id}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${
                  t.status === "ACTIVE"
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                    : "border-border bg-[hsl(var(--muted))] text-muted-foreground"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${t.status === "ACTIVE" ? "bg-emerald-400" : "bg-muted-foreground/40"}`} />
                {t.label.split("(")[0].trim()}
              </span>
            ))}
          </div>
        </div>
      )}

      {!state?.configured && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <p className="text-[13px] text-amber-400/80">
            Composio is not configured. Go to{" "}
            <a href="/integrations" className="underline underline-offset-2 hover:text-amber-300">
              Integrations
            </a>{" "}
            to add your API key and connect toolkits.
          </p>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
 * MAIN SETTINGS PAGE
 * ───────────────────────────────────────────────────────── */
export default function SettingsPage() {
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-2xl px-3 py-8 sm:px-4">
        {/* Page header */}
        <div className="mb-8">
          <div className="mb-1.5 flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
            <ShieldCheck size={14} />
            Configuration
          </div>
          <h1 className="text-[32px] font-semibold tracking-tight text-foreground">Settings</h1>
          <p className="mt-1 text-[14px] text-muted-foreground">
            Configure NVIDIA, Composio, and model preferences for Claw.
          </p>
        </div>

        <div className="space-y-6">
          <NvidiaPanel />
          <ComposioPanel />
        </div>
      </div>
    </AppShell>
  );
}
