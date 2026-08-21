"use client";

import { useCallback, useEffect, useState } from "react";
import presets from "@/data/campaign-presets.json";
import backgrounds from "@/data/backgrounds.json";
import tones from "@/data/tones.json";
import avatars from "@/data/avatar-presets.json";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { Check, RefreshCcw } from "lucide-react";

type Campaign = { id: string; name: string; category: string; website?: string | null; mission: string; tone?: string | null; platform?: string | null; avatarId?: string | null; backgroundId?: string | null; status: string; createdAt: string };

export default function CampaignsPage() {
  const [name,setName]=useState("CaseClosedFL campaign");
  const [website,setWebsite]=useState("https://caseclosedfl.com");
  const [category,setCategory]=useState(presets[0]?.id || "ugc");
  const [avatarId,setAvatarId]=useState(avatars[0]?.id || "");
  const [tone,setTone]=useState(tones[0] || "direct");
  const [backgroundId,setBackgroundId]=useState(backgrounds[0]?.id || "");
  const [mission,setMission]=useState("Create a direct-response PI campaign for rideshare passengers who were injured and need a case review.");
  const [campaigns,setCampaigns]=useState<Campaign[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [saved,setSaved]=useState<string|null>(null);

  const load=useCallback(async()=>{
    const r=await fetch("/api/campaigns",{cache:"no-store"});
    if(!r.ok) return;
    const d=await r.json(); setCampaigns(d.campaigns||[]);
  },[]);
  useEffect(()=>{load();},[load]);

  async function createCampaign(){
    setBusy(true);setError(null);setSaved(null);
    try{
      const r=await fetch("/api/campaigns",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name,website,category,avatarId,tone,backgroundId,mission,platform:"instagram"})});
      const d=await r.json(); if(!r.ok) throw new Error(d.error||`HTTP ${r.status}`);
      setSaved(d.campaign.id); await load();
    }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
  }

  return <AuthGuard><AppShell><main className="mx-auto max-w-7xl px-4 py-8">
    <div className="mb-6 flex flex-col gap-2"><h1 className="text-3xl font-semibold tracking-tight">Campaigns</h1><p className="max-w-3xl text-slate-600">Build and persist campaign intent for the internal production workflow. Campaign records can feed the NVIDIA copy writer, avatar selection, video generation, calendar, and Composio publishing stages.</p></div>
    {error&&<div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
    {saved&&<div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700"><Check size={15}/>Campaign saved.</div>}
    <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
      <Card title="Campaign Builder" actions={<Button onClick={createCampaign} disabled={busy||!name.trim()||!mission.trim()}>{busy?<><RefreshCcw size={14} className="mr-2 animate-spin"/>Saving…</>:"Create campaign"}</Button>}>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Campaign name</span><input value={name} onChange={e=>setName(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm"/></label>
          <label className="space-y-2"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Website</span><input value={website} onChange={e=>setWebsite(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm" placeholder="https://caseclosedfl.com"/></label>
          <label className="space-y-2"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Category</span><select value={category} onChange={e=>setCategory(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">{presets.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
          <label className="space-y-2"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Avatar</span><select value={avatarId} onChange={e=>setAvatarId(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">{avatars.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
          <label className="space-y-2"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tone</span><select value={tone} onChange={e=>setTone(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">{tones.map(t=><option key={t} value={t}>{t}</option>)}</select></label>
          <label className="space-y-2"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Background</span><select value={backgroundId} onChange={e=>setBackgroundId(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">{backgrounds.map(bg=><option key={bg.id} value={bg.id}>{bg.name}</option>)}</select></label>
          <label className="space-y-2 md:col-span-2"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Mission</span><textarea value={mission} onChange={e=>setMission(e.target.value)} className="min-h-32 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm"/></label>
        </div>
      </Card>
      <Card title="Production stack"><ul className="list-disc space-y-2 pl-5 text-sm text-slate-800"><li>NVIDIA content intelligence writes scripts, hooks, captions, and post copy.</li><li>NVIDIA FLUX image generation creates inexpensive avatar/reference portraits.</li><li>Hedra, Grok Imagine, Gemini/Veo, and A2E are alternative final video engines.</li><li>Composio remains the connected-account and publishing layer.</li></ul></Card>
    </div>
    <div className="mt-6"><Card title="Saved campaigns"><div className="grid gap-2">{campaigns.map(c=><div key={c.id} className="rounded-xl border border-slate-200 bg-white p-3"><div className="flex items-center justify-between gap-3"><div><div className="font-medium text-slate-900">{c.name}</div><div className="text-xs text-slate-500">{c.category} · {c.status} · {new Date(c.createdAt).toLocaleString()}</div></div></div><div className="mt-2 line-clamp-2 text-sm text-slate-600">{c.mission}</div></div>)}{!campaigns.length&&<div className="py-6 text-center text-sm text-slate-500">No saved campaigns yet.</div>}</div></Card></div>
  </main></AppShell></AuthGuard>;
}
