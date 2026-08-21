"use client";
import { useEffect, useState } from "react";
import { Car, Truck, Footprints, Smartphone, WandSparkles, Upload, Play, ShieldCheck, Sparkles, Atom, Cloud, Bird } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const modes = [
  { id:"car_accident", title:"Car Accident", icon:Car, sub:"Roadside, collision, aftermath" },
  { id:"rideshare", title:"Rideshare / Uber / Lyft", icon:Smartphone, sub:"Passenger and driver scenarios" },
  { id:"trucking", title:"Trucking / 18-Wheeler", icon:Truck, sub:"Commercial vehicle incidents" },
  { id:"slip_fall", title:"Slip & Fall", icon:Footprints, sub:"Premises-liability scenarios" },
  { id:"ugc", title:"UGC Video", icon:WandSparkles, sub:"Creator-style product or subject video" }
] as const;

const providerPills = [
  { id:"veo",   label:"Google Veo 3.1",  icon:Sparkles, sub:"direct" },
  { id:"grok",  label:"xAI Grok Imagine", icon:Atom,     sub:"x.ai" },
  { id:"a2e",   label:"A2E AI router",    icon:Cloud,    sub:"veo · wan · kling · sora" },
  { id:"hedra", label:"Hedra v3",         icon:Bird,     sub:"character-3 · avatar · grok-video" }
] as const;

type ProviderId = "veo" | "grok" | "a2e" | "hedra";

type Job = { id:string; provider?:ProviderId; status:string; error?:string; fileUrl?:string|null };
export function GeneratorConsole() {
  const [category,setCategory]=useState<(typeof modes)[number]["id"]>("car_accident");
  const [provider,setProvider]=useState<ProviderId>("veo");
  const [settings,setSettings]=useState<any>(null);
  const [mission,setMission]=useState(""); const [subject,setSubject]=useState(""); const [script,setScript]=useState("");
  const [image,setImage]=useState<{base64:string;mime:string;name:string}|null>(null); const [job,setJob]=useState<Job|null>(null); const [busy,setBusy]=useState(false);

  useEffect(()=>{ fetch("/api/admin/settings").then(r=>r.ok?r.json():null).then(s=>{ if(s){ setSettings(s); setProvider(s.defaultProvider || "veo"); } }).catch(()=>{}); },[]);

  async function onFile(file?:File) { if(!file)return; if(file.size>10*1024*1024){alert("Image must be 10MB or smaller");return;} const base64 = await new Promise<string>((resolve,reject)=>{ const reader=new FileReader(); reader.onload=()=>resolve(String(reader.result).split(",")[1]||""); reader.onerror=()=>reject(reader.error); reader.readAsDataURL(file); }); setImage({base64,mime:file.type,name:file.name}); }

  async function generate(){
    setBusy(true); setJob(null);
    const r=await fetch("/api/internal/generate",{method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify({provider,category,mission,subject,script,imageBase64:image?.base64,imageMimeType:image?.mime})});
    const d=await r.json(); setBusy(false);
    if(!r.ok){ setJob({id:"",provider,status:"failed",error:d.error}); return; }
    setJob({ ...(d.job || {}), provider });
  }
  useEffect(()=>{ if(!job?.id || ["succeeded","failed"].includes(job.status))return; const t=setInterval(async()=>{const r=await fetch(`/api/v1/video/${job.id}`); if(r.ok){const d=await r.json(); setJob((j)=>({...(j||{}),...d}));}},5000); return()=>clearInterval(t); },[job?.id,job?.status]);

  const selectedProvider = providerPills.find(p => p.id === provider) || providerPills[0];
  const SelectedIcon = selectedProvider.icon;

  return <main>
    <div className="mb-7 flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm text-violet-700"><ShieldCheck size={16}/> One-shot protocol enforced · 8 seconds · no cuts, no extension, no stitching</div>
      <h1 className="text-[34px] font-semibold leading-[1.1] tracking-tight text-slate-900">Generate an 8-second campaign shot</h1>
      <p className="max-w-2xl text-[15px] text-slate-600">Pick a campaign engine and a video provider. Each request is compiled into one continuous shot with native audio.</p>
    </div>

    <div className="mb-6">
      <div className="mb-2 text-xs uppercase tracking-wider text-slate-500">Video provider</div>
      <div className="grid gap-3 md:grid-cols-3">
        {providerPills.map(p => {
          const I = p.icon;
          const active = provider === p.id;
          const configured = settings?.providers?.[p.id]?.keyConfigured;
          return (
            <button key={p.id} onClick={() => setProvider(p.id as ProviderId)}
              className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition ${active ? "border-violet-400 bg-violet-50 ring-1 ring-violet-200" : "border-slate-200 bg-white hover:border-slate-300"}`}>
              <I className={active ? "text-violet-600" : "text-slate-500"} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div className="truncate font-medium text-slate-900">{p.label}</div>
                  {configured === false && <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-800">key needed</span>}
                  {configured === true && active && <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-emerald-700">ready</span>}
                </div>
                <div className="truncate text-xs text-slate-500">{p.sub}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>

    <div className="mb-2 text-xs uppercase tracking-wider text-slate-500">Campaign engine</div>
    <div className="grid gap-3 md:grid-cols-5">{modes.map(m=>{const I=m.icon;const active=category===m.id;return <button key={m.id} onClick={()=>setCategory(m.id)} className={`rounded-2xl border p-4 text-left transition ${active?"border-violet-400 bg-violet-50 ring-1 ring-violet-200":"border-slate-200 bg-white hover:border-slate-300"}`}><I className={active?"text-violet-600":"text-slate-500"}/><div className="mt-3 font-medium text-slate-900">{m.title}</div><div className="mt-1 text-xs text-slate-500">{m.sub}</div></button>})}</div>
    <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
      <div className="soro-card p-5"><div className="grid gap-4">
        <label className="grid gap-2 text-sm"><span className="text-slate-700">Mission</span><Textarea className="bg-white" value={mission} onChange={e=>setMission(e.target.value)} placeholder="Example: Make people injured in a rear-end crash understand why documenting the scene matters."/></label>
        <label className="grid gap-2 text-sm"><span className="text-slate-700">Subject / product / spokesperson direction</span><Input className="bg-white" value={subject} onChange={e=>setSubject(e.target.value)} placeholder="Optional subject or reference instructions"/></label>
        <label className="grid gap-2 text-sm"><span className="text-slate-700">Exact dialogue (optional)</span><Textarea className="bg-white" value={script} onChange={e=>setScript(e.target.value)} placeholder='Example: "I didn’t know what to document after the crash."'/></label>
        <label className="grid gap-2 text-sm"><span className="text-slate-700">Reference / starting image (optional)</span><div className="flex items-center gap-3"><Input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>onFile(e.target.files?.[0])}/>{image&&<span className="max-w-36 truncate text-xs text-slate-600">{image.name}</span>}<Upload size={18}/></div></label>
        <Button size="lg" disabled={busy} onClick={generate} className="bg-violet-600 text-white hover:bg-violet-700"><Play size={17} className="mr-2"/>{busy?`Starting ${selectedProvider.label}…`:"Generate one shot"}</Button>
      </div></div>
      <div className="soro-card min-h-[470px] overflow-hidden p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="font-medium text-slate-900">Output</div>
            <div className="text-xs text-slate-500">8 seconds · native audio · one continuous shot{job?.provider && ` · ${providerPills.find(p=>p.id===job.provider)?.label || job.provider}`}</div>
          </div>
          {job && <span className="rounded-full bg-slate-100 px-3 py-1 text-xs uppercase tracking-wide text-slate-700">{job.status}</span>}
        </div>
        {!job && <div className="grid h-[360px] place-items-center rounded-xl border border-dashed border-slate-200 text-center text-sm text-slate-500">Your generated video will appear here.</div>}
        {job?.status==="failed" && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{job.error}</div>}
        {job && !["succeeded","failed"].includes(job.status) && <div className="grid h-[360px] place-items-center"><div className="text-center"><div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-slate-200 border-t-violet-600"/><div>{selectedProvider.label} is generating the shot…</div><div className="mt-1 text-xs text-slate-500">The console polls the provider operation every 5 seconds.</div></div></div>}
        {job?.status==="succeeded" && job.fileUrl && <video src={job.fileUrl} className="max-h-[520px] w-full rounded-xl bg-black" controls autoPlay playsInline/>}
      </div>
    </div>
  </main>;
}
