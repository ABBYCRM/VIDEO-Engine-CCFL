"use client";

import { useCallback, useEffect, useState } from "react";
import { BrainCircuit, Check, ChevronDown, ChevronUp, Plus, RefreshCcw, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type ChannelMixEntry = { channel: string; cadence: string; rationale: string };
type Strategy = {
  id: string;
  siteId: string | null;
  title: string;
  horizon: "weekly" | "monthly" | "quarterly";
  goals: string[];
  channelMix: ChannelMixEntry[];
  contentPillars: string[];
  rationale: string;
  status: "draft" | "approved";
  createdAt: string;
};

function Notice({ tone, children }: { tone: "error" | "success"; children: React.ReactNode }) {
  return <div className={`mb-4 rounded-xl border p-3 text-sm ${tone === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{children}</div>;
}
function Stat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl border bg-white p-4"><div className="text-2xl font-semibold">{value}</div><div className="text-xs text-slate-500">{label}</div></div>;
}

export function StrategiesConsole() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/strategies", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setStrategies(d.strategies || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function approve(id: string) {
    setError(null);
    try {
      const r = await fetch(`/api/strategies/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "approved" }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setMessage(`Approved "${d.strategy.title}"`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function remove(id: string, title: string) {
    if (!confirm(`Delete strategy "${title}"?`)) return;
    await fetch(`/api/strategies/${id}`, { method: "DELETE" });
    await load();
  }

  const approved = strategies.filter(s => s.status === "approved").length;

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-violet-700"><BrainCircuit size={16} /> Cross-channel planning</div>
          <h2 className="text-2xl font-semibold tracking-tight">Strategies</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">AI drafts a goals/channel-mix/content-pillar plan grounded in what's actually connected; you review and approve.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={load}><RefreshCcw size={14} className={`mr-2 ${loading ? "animate-spin" : ""}`} />Refresh</Button>
          <Button onClick={() => setCreating(true)}><Plus size={14} className="mr-2" />New strategy</Button>
        </div>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {message && <Notice tone="success">{message}</Notice>}
      <div className="mb-5 grid gap-3 sm:grid-cols-2"><Stat label="Strategies" value={strategies.length} /><Stat label="Approved" value={approved} /></div>

      <div className="grid gap-4">
        {strategies.map(s => (
          <section key={s.id} className="rounded-2xl border bg-white p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold">{s.title}</div>
                <div className="mt-1 text-xs text-slate-500">{s.horizon} · {new Date(s.createdAt).toLocaleDateString()}</div>
              </div>
              <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase ${s.status === "approved" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{s.status}</span>
            </div>
            <button type="button" onClick={() => toggle(s.id)} className="mt-3 flex w-full items-center justify-between rounded-xl border bg-slate-50 px-3 py-2 text-left text-xs font-semibold text-slate-700">
              <span>{s.goals.length} goal(s) · {s.channelMix.length} channel(s) · {s.contentPillars.length} pillar(s)</span>
              {expanded.has(s.id) ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {expanded.has(s.id) && (
              <div className="mt-3 grid gap-3 text-sm">
                <div><div className="text-xs font-semibold uppercase text-slate-400">Goals</div><ul className="mt-1 list-disc pl-5 text-slate-700">{s.goals.map((g, i) => <li key={i}>{g}</li>)}</ul></div>
                <div><div className="text-xs font-semibold uppercase text-slate-400">Channel mix</div><ul className="mt-1 space-y-1">{s.channelMix.map((c, i) => <li key={i} className="rounded-lg bg-slate-50 p-2"><span className="font-medium capitalize">{c.channel}</span> · {c.cadence} — <span className="text-slate-600">{c.rationale}</span></li>)}</ul></div>
                <div><div className="text-xs font-semibold uppercase text-slate-400">Content pillars</div><ul className="mt-1 list-disc pl-5 text-slate-700">{s.contentPillars.map((p, i) => <li key={i}>{p}</li>)}</ul></div>
                {s.rationale && <div><div className="text-xs font-semibold uppercase text-slate-400">Rationale</div><p className="mt-1 text-slate-600">{s.rationale}</p></div>}
              </div>
            )}
            <div className="mt-4 flex gap-2">
              {s.status !== "approved" && <Button size="sm" onClick={() => approve(s.id)}><Check size={13} className="mr-1" />Approve</Button>}
              <button onClick={() => remove(s.id, s.title)} aria-label={`Delete ${s.title}`} className="grid h-9 w-9 place-items-center rounded-lg border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"><Trash2 size={14} /></button>
            </div>
          </section>
        ))}
        {!loading && !strategies.length && (
          <div className="grid min-h-72 place-items-center rounded-2xl border border-dashed bg-white text-center">
            <div><BrainCircuit className="mx-auto mb-3 text-slate-400" /><div className="font-medium">No strategies yet</div><p className="mt-1 text-sm text-slate-500">Generate one from a title and horizon — AI grounds it in your connected channels.</p></div>
          </div>
        )}
      </div>

      {creating && <NewStrategyModal onClose={() => setCreating(false)} onCreated={async () => { setCreating(false); await load(); }} />}
    </div>
  );
}

function NewStrategyModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [horizon, setHorizon] = useState<"weekly" | "monthly" | "quarterly">("monthly");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cls = "min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";

  async function generate() {
    if (!title.trim()) { setError("Give the strategy a title first."); return; }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/strategies", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title, horizon }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      await onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 p-4">
      <div className="mx-auto my-10 max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-start justify-between">
          <div className="text-xl font-semibold">New strategy</div>
          <button onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-800 hover:bg-slate-200"><X size={16} /></button>
        </div>
        <div className="grid gap-4">
          <label className="grid gap-1 text-sm"><span className="font-medium text-slate-700">Title</span><input value={title} onChange={e => setTitle(e.target.value)} placeholder="Q1 growth plan" className={cls} /></label>
          <label className="grid gap-1 text-sm"><span className="font-medium text-slate-700">Horizon</span>
            <select value={horizon} onChange={e => setHorizon(e.target.value as any)} className={cls}>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
            </select>
          </label>
        </div>
        {error && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={generate} disabled={busy}>{busy ? <><RefreshCcw size={14} className="mr-2 animate-spin" />Generating…</> : <><Sparkles size={14} className="mr-2" />Generate with AI</>}</Button>
        </div>
      </div>
    </div>
  );
}
