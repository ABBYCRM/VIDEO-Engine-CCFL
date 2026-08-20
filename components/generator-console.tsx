"use client";
import { useEffect, useState } from "react";
import { Car, Truck, Footprints, Smartphone, WandSparkles, Upload, Play, ShieldCheck } from "lucide-react";
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

type Job = { id:string; status:string; error?:string; fileUrl?:string|null };
export function GeneratorConsole() {
  const [category,setCategory]=useState<(typeof modes)[number]["id"]>("car_accident");
  const [mission,setMission]=useState(""); const [subject,setSubject]=useState(""); const [script,setScript]=useState("");
  const [image,setImage]=useState<{base64:string;mime:string;name:string}|null>(null); const [job,setJob]=useState<Job|null>(null); const [busy,setBusy]=useState(false);
  async function onFile(file?:File) { if(!file)return; if(file.size>10*1024*1024){alert("Image must be 10MB or smaller");return;} const base64 = await new Promise<string>((resolve,reject)=>{ const reader=new FileReader(); reader.onload=()=>resolve(String(reader.result).split(",")[1]||""); reader.onerror=()=>reject(reader.error); reader.readAsDataURL(file); }); setImage({base64,mime:file.type,name:file.name}); }
  async function generate(){ setBusy(true); setJob(null); const r=await fetch("/api/internal/generate",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({category,mission,subject,script,imageBase64:image?.base64,imageMimeType:image?.mime})}); const d=await r.json(); setBusy(false); if(!r.ok){setJob({id:"",status:"failed",error:d.error});return;} setJob(d.job); }
  useEffect(()=>{ if(!job?.id || ["succeeded","failed"].includes(job.status))return; const t=setInterval(async()=>{const r=await fetch(`/api/v1/video/${job.id}`); if(r.ok){const d=await r.json(); setJob(d);}},5000); return()=>clearInterval(t); },[job?.id,job?.status]);
  return <main className="mx-auto max-w-7xl px-4 py-8">
    <div className="mb-7 flex flex-col gap-2"><div className="flex items-center gap-2 text-sm text-cyan-300"><ShieldCheck size={16}/> One-shot protocol enforced</div><h1 className="text-3xl font-semibold tracking-tight">Generate an 8-second campaign shot</h1><p className="max-w-3xl text-slate-400">Choose a campaign engine. Each request is compiled into one continuous Veo shot with native audio—no cuts, no extension, no automatic stitching.</p></div>
    <div className="grid gap-4 md:grid-cols-5">{modes.map(m=>{const I=m.icon;const active=category===m.id;return <button key={m.id} onClick={()=>setCategory(m.id)} className={`rounded-2xl border p-4 text-left transition ${active?"border-cyan-400 bg-cyan-400/10":"border-slate-800 bg-slate-950/60 hover:border-slate-600"}`}><I className={active?"text-cyan-300":"text-slate-400"}/><div className="mt-3 font-medium">{m.title}</div><div className="mt-1 text-xs text-slate-500">{m.sub}</div></button>})}</div>
    <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
      <Card className="p-5"><div className="grid gap-4"><label className="grid gap-2 text-sm"><span>Mission</span><Textarea value={mission} onChange={e=>setMission(e.target.value)} placeholder="Example: Make people injured in a rear-end crash understand why documenting the scene matters."/></label><label className="grid gap-2 text-sm"><span>Subject / product / spokesperson direction</span><Input value={subject} onChange={e=>setSubject(e.target.value)} placeholder="Optional subject or reference instructions"/></label><label className="grid gap-2 text-sm"><span>Exact dialogue (optional)</span><Textarea value={script} onChange={e=>setScript(e.target.value)} placeholder='Example: "I didn’t know what to document after the crash."'/></label><label className="grid gap-2 text-sm"><span>Reference / starting image (optional)</span><div className="flex items-center gap-3"><Input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>onFile(e.target.files?.[0])}/>{image&&<span className="max-w-36 truncate text-xs text-slate-400">{image.name}</span>}<Upload size={18}/></div></label><Button size="lg" disabled={busy} onClick={generate}><Play size={17} className="mr-2"/>{busy?"Starting Veo generation…":"Generate one shot"}</Button></div></Card>
      <Card className="min-h-[470px] overflow-hidden p-5"><div className="mb-4 flex items-center justify-between"><div><div className="font-medium">Output</div><div className="text-xs text-slate-500">8 seconds · native audio · one continuous shot</div></div>{job&&<span className="rounded-full bg-slate-800 px-3 py-1 text-xs uppercase tracking-wide">{job.status}</span>}</div>{!job&&<div className="grid h-[360px] place-items-center rounded-xl border border-dashed border-slate-800 text-center text-sm text-slate-500">Your generated video will appear here.</div>}{job?.status==="failed"&&<div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{job.error}</div>}{job&&!["succeeded","failed"].includes(job.status)&&<div className="grid h-[360px] place-items-center"><div className="text-center"><div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-slate-700 border-t-cyan-300"/><div>Veo is generating the shot…</div><div className="mt-1 text-xs text-slate-500">The console polls the provider operation every 5 seconds.</div></div></div>}{job?.status==="succeeded"&&job.fileUrl&&<video src={job.fileUrl} className="max-h-[520px] w-full rounded-xl bg-black" controls autoPlay playsInline/>}</Card>
    </div>
  </main>;
}
