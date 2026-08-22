"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Image as ImageIcon, RefreshCcw, Search } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { Button } from "@/components/ui/button";

type Asset = {
  id: string;
  kind: "generated" | "reference" | "turnaround" | string;
  label: string;
  title: string;
  url: string;
  model: string | null;
  prompt: string | null;
  createdAt: string;
};

const FILTERS = ["all", "generated", "reference", "turnaround"] as const;

export default function LibraryPage() {
  const [assets,setAssets] = useState<Asset[]>([]);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState<string|null>(null);
  const [filter,setFilter] = useState<typeof FILTERS[number]>("all");
  const [query,setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch("/api/library", { cache:"no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setAssets(d.assets || []);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assets.filter(asset => {
      if (filter !== "all" && asset.kind !== filter) return false;
      if (!q) return true;
      return `${asset.title} ${asset.label} ${asset.model || ""}`.toLowerCase().includes(q);
    });
  }, [assets,filter,query]);

  return <AuthGuard><AppShell><main>
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-violet-700"><ImageIcon size={16}/> Generated media</div>
        <h1 className="text-[34px] font-semibold leading-tight tracking-tight text-slate-900">Library</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">The visual asset gallery: generated portraits, canonical identity references, and ready turnaround views. Internal prompts stay internal.</p>
      </div>
      <Button variant="secondary" onClick={load} disabled={loading}><RefreshCcw size={14} className={`mr-2 ${loading?"animate-spin":""}`}/>Refresh</Button>
    </div>

    <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap gap-2">{FILTERS.map(item => <button key={item} onClick={() => setFilter(item)} className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize ${filter===item?"bg-violet-600 text-white":"bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{item}</button>)}</div>
      <label className="flex h-10 min-w-64 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm"><Search size={14} className="text-slate-400"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search images or models" className="min-w-0 flex-1 outline-none" aria-label="Search library"/></label>
    </div>

    {error && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
    <div className="mb-4 text-sm text-slate-500">{loading ? "Loading media…" : `${visible.length} of ${assets.length} images`}</div>

    {visible.length > 0 ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {visible.map(asset => <figure key={asset.id} className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <a href={asset.url} target="_blank" rel="noreferrer" className="block aspect-[3/4] overflow-hidden bg-slate-100"><img src={asset.url} alt={`${asset.title} ${asset.label}`} className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.02]"/></a>
        <figcaption className="p-3">
          <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate font-medium text-slate-900">{asset.title}</div><div className="mt-0.5 text-xs capitalize text-slate-500">{asset.label}</div></div><span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-semibold uppercase text-slate-500">{asset.kind}</span></div>
          {asset.model && <div className="mt-2 truncate text-[10px] text-slate-400" title={asset.model}>{asset.model}</div>}
        </figcaption>
      </figure>)}
    </div> : !loading && <div className="grid min-h-72 place-items-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center"><div><ImageIcon className="mx-auto mb-3 text-slate-400"/><div className="font-medium text-slate-800">No images in this view</div><p className="mt-1 text-sm text-slate-500">Generate a portrait or avatar view and it will be saved here automatically.</p></div></div>}
  </main></AppShell></AuthGuard>;
}
