"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Image as ImageIcon, RefreshCcw, Users } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { Button } from "@/components/ui/button";

type ViewKey = "front" | "left" | "right" | "back";
type Avatar = { id:string; name:string; archetype:string; referenceImage:string|null; views:Record<ViewKey,{status:string}> };
type Asset = { key:string; avatarId:string; avatarName:string; label:string; url:string; kind:string };

export default function LibraryPage() {
  const [avatars,setAvatars]=useState<Avatar[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const load=useCallback(async()=>{ setLoading(true); setError(null); try { const r=await fetch("/api/admin/avatars",{cache:"no-store"}); const d=await r.json(); if(!r.ok) throw new Error(d.error||`HTTP ${r.status}`); setAvatars(d.avatars||[]); } catch(e){ setError(e instanceof Error?e.message:String(e)); } finally { setLoading(false); } },[]);
  useEffect(()=>{load();},[load]);
  const assets=useMemo<Asset[]>(()=>avatars.flatMap(a=>{
    const out:Asset[]=[];
    if(a.referenceImage) out.push({key:`${a.id}:reference`,avatarId:a.id,avatarName:a.name,label:"Identity reference",url:`/api/admin/avatars/${a.id}/asset?view=reference`,kind:"reference"});
    for(const view of ["front","left","right","back"] as const) if(a.views?.[view]?.status==="ready") out.push({key:`${a.id}:${view}`,avatarId:a.id,avatarName:a.name,label:`${view} view`,url:`/api/admin/avatars/${a.id}/asset?view=${view}`,kind:view});
    return out;
  }),[avatars]);
  return <AuthGuard><AppShell><main>
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><div className="mb-2 flex items-center gap-2 text-sm font-medium text-violet-700"><ImageIcon size={16}/> Generated media</div><h1 className="text-[34px] font-semibold leading-tight tracking-tight text-slate-900">Library</h1><p className="mt-1 max-w-3xl text-sm text-slate-600">Gallery of identity references and AI-generated avatar images. Prompts and internal RAG files are not shown here.</p></div>
      <Button variant="secondary" onClick={load} disabled={loading}><RefreshCcw size={14} className={`mr-2 ${loading?"animate-spin":""}`}/>Refresh</Button>
    </div>
    {error&&<div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
    <div className="mb-4 flex items-center gap-2 text-sm text-slate-500"><Users size={14}/>{assets.length} image{assets.length===1?"":"s"} across {avatars.length} avatar{avatars.length===1?"":"s"}</div>
    {assets.length>0?<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{assets.map(asset=><figure key={asset.key} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="aspect-[3/4] bg-slate-100"><img src={asset.url} alt={`${asset.avatarName} ${asset.label}`} className="h-full w-full object-cover"/></div><figcaption className="p-3"><div className="font-medium text-slate-900">{asset.avatarName}</div><div className="mt-0.5 text-xs capitalize text-slate-500">{asset.label}</div></figcaption></figure>)}</div>:!loading&&<div className="grid min-h-72 place-items-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center"><div><ImageIcon className="mx-auto mb-3 text-slate-400"/><div className="font-medium text-slate-800">No generated images yet</div><p className="mt-1 text-sm text-slate-500">Generate or upload avatar imagery and it will appear here automatically.</p></div></div>}
  </main></AppShell></AuthGuard>;
}
