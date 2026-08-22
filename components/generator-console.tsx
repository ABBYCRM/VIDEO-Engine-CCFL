"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Atom, Bird, CalendarPlus, Car, Cloud, Footprints, Instagram, Mic2, Play, Smartphone, Sparkles, Truck, Upload, UserRound, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const modes = [
  { id:"car_accident", title:"Car Accident", icon:Car, sub:"Roadside, collision, aftermath" },
  { id:"rideshare", title:"Rideshare / Uber / Lyft", icon:Smartphone, sub:"Passenger and driver scenarios" },
  { id:"trucking", title:"Trucking / 18-Wheeler", icon:Truck, sub:"Commercial vehicle incidents" },
  { id:"slip_fall", title:"Slip & Fall", icon:Footprints, sub:"Premises-liability scenarios" },
  { id:"ugc", title:"UGC Video", icon:WandSparkles, sub:"Creator-style campaign video" }
] as const;

const providers = [
  { id:"veo", label:"Google Veo 3.1", icon:Sparkles, cap:"8s cinematic", duration:8 },
  { id:"grok", label:"xAI Grok Imagine", icon:Atom, cap:"up to 15s", duration:15 },
  { id:"a2e", label:"A2E AI router", icon:Cloud, cap:"model dependent", duration:8 },
  { id:"hedra", label:"Hedra", icon:Bird, cap:"15/30s avatar · audio driven", duration:30 }
] as const;

type ProviderId = typeof providers[number]["id"];
type Job = { id:string; provider?:ProviderId; status:string; error?:string; fileUrl?:string|null };
type MediaInput = { base64:string; mime:string; name:string };
type AvatarOption = { id:string; name:string; referenceImage:string|null; views?:{ front?:{ status?:string } } };

async function fileToMedia(file: File): Promise<MediaInput> {
  const base64 = await new Promise<string>((resolve,reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  return { base64, mime:file.type || "application/octet-stream", name:file.name };
}

export function GeneratorConsole() {
  const [category,setCategory] = useState<typeof modes[number]["id"]>("car_accident");
  const [provider,setProvider] = useState<ProviderId>("veo");
  const [settings,setSettings] = useState<any>(null);
  const [avatars,setAvatars] = useState<AvatarOption[]>([]);
  const [selectedAvatar,setSelectedAvatar] = useState("");
  const [loadingAvatar,setLoadingAvatar] = useState(false);
  const [mission,setMission] = useState("");
  const [subject,setSubject] = useState("");
  const [script,setScript] = useState("");
  const [image,setImage] = useState<MediaInput|null>(null);
  const [audio,setAudio] = useState<MediaInput|null>(null);
  const [hedraDuration,setHedraDuration] = useState<15|30>(30);
  const [job,setJob] = useState<Job|null>(null);
  const [busy,setBusy] = useState(false);
  const [scheduleState,setScheduleState] = useState<"idle"|"saving"|"saved">("idle");
  const [instagramState,setInstagramState] = useState<"idle"|"posting"|"posted">("idle");
  const [error,setError] = useState<string|null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/settings").then(r => r.ok ? r.json() : null),
      fetch("/api/admin/avatars", { cache:"no-store" }).then(r => r.ok ? r.json() : { avatars:[] })
    ]).then(([s,a]) => {
      if (s) { setSettings(s); setProvider(s.defaultProvider || "veo"); }
      setAvatars(a?.avatars || []);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!job?.id || ["succeeded","failed"].includes(job.status)) return;
    const timer = setInterval(async () => {
      const r = await fetch(`/api/v1/video/${job.id}`, { cache:"no-store" });
      if (r.ok) {
        const d = await r.json();
        setJob(j => ({ ...(j || {}), ...d } as Job));
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [job?.id,job?.status]);

  const selected = providers.find(p => p.id === provider)!;
  const selectedMode = modes.find(m => m.id === category)!;
  const hedraReady = provider !== "hedra" || Boolean(image && audio);
  const durationSeconds = provider === "hedra" ? hedraDuration : selected.duration;

  async function chooseImage(file?: File) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setError("Reference image must be 10MB or smaller."); return; }
    setImage(await fileToMedia(file));
    setSelectedAvatar("");
    setError(null);
  }

  async function chooseAvatar(avatarId: string) {
    setSelectedAvatar(avatarId);
    if (!avatarId) return;
    const avatar = avatars.find(a => a.id === avatarId);
    if (!avatar) return;
    setLoadingAvatar(true); setError(null);
    try {
      const view = avatar.views?.front?.status === "ready" ? "front" : "reference";
      if (view === "reference" && !avatar.referenceImage) throw new Error("This avatar has no reference identity yet.");
      const r = await fetch(`/api/admin/avatars/${encodeURIComponent(avatar.id)}/asset?view=${view}`, { cache:"no-store" });
      if (!r.ok) throw new Error(`Could not load ${avatar.name} ${view} image`);
      const blob = await r.blob();
      const media = await fileToMedia(new File([blob], `${avatar.id}-${view}.png`, { type:blob.type || "image/png" }));
      setImage(media);
      if (!subject.trim()) setSubject(`${avatar.name}, canonical campaign identity. Preserve face, hair, wardrobe standard, and recognizable identity across the entire shot.`);
    } catch (e) {
      setSelectedAvatar("");
      setImage(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoadingAvatar(false); }
  }

  async function chooseAudio(file?: File) {
    if (!file) return;
    if (file.size > 105 * 1024 * 1024) { setError("Driving audio must be 105MB or smaller."); return; }
    setAudio(await fileToMedia(file));
    setError(null);
  }

  async function generate() {
    if (provider === "hedra" && (!image || !audio)) {
      setError("Hedra Character/Avatar needs both a canonical avatar/reference image and driving audio. Add both before generating.");
      return;
    }
    setBusy(true); setJob(null); setError(null); setScheduleState("idle"); setInstagramState("idle");
    try {
      const r = await fetch("/api/internal/generate", {
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({ provider, category, mission, subject, script, durationSeconds, imageBase64:image?.base64, imageMimeType:image?.mime, audioBase64:audio?.base64, audioMimeType:audio?.mime })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setJob({ ...(d.job || {}), provider });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setJob({ id:"", provider, status:"failed", error:message });
      setError(message);
    } finally { setBusy(false); }
  }

  async function sendToCalendar() {
    if (!job?.id || job.status !== "succeeded") return;
    setScheduleState("saving"); setError(null);
    try {
      const when = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const r = await fetch("/api/calendar", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({ title:`${selectedMode.title} · ${selected.label}`, network:"instagram", scheduledAt:when.toISOString(), status:"pending", autoPost:false, contentType:category === "ugc" ? "ugc" : "cinematic", caption:mission || script || `${selectedMode.title} generated video`, videoJobId:job.id }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setScheduleState("saved");
    } catch (e) { setScheduleState("idle"); setError(e instanceof Error ? e.message : String(e)); }
  }

  async function postToInstagram() {
    if (!job?.id || job.status !== "succeeded") return;
    if (!confirm("Publish this generated video to the connected Instagram Business/Creator account now?")) return;
    setInstagramState("posting"); setError(null);
    try {
      const r = await fetch("/api/publish/instagram", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({ jobId:job.id, caption:mission || script || `${selectedMode.title} generated video` }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setInstagramState("posted");
    } catch (e) { setInstagramState("idle"); setError(e instanceof Error ? e.message : String(e)); }
  }

  return <main>
    <div className="mb-7"><div className="mb-2 text-sm font-medium text-violet-700">Campaign production</div><h1 className="text-[34px] font-semibold leading-tight tracking-tight text-slate-900">Create campaign content</h1><p className="mt-1 max-w-3xl text-[15px] text-slate-600">Choose the content format, campaign type, video engine, and canonical spokesperson. Generated assets can go to Library, Calendar, or directly to the connected Instagram account.</p></div>

    <div className="mb-6 grid gap-3 sm:grid-cols-2"><Link href="/podcast-interview" className="rounded-2xl border border-violet-300 bg-violet-50 p-4 transition hover:border-violet-500"><Mic2 className="text-violet-600"/><div className="mt-2 font-semibold">Podcast / split-screen</div><div className="text-xs text-slate-600">Uploaded source video on top + 15/30s AI host below. Hedra preferred, other engines remain available.</div></Link><button onClick={() => setCategory("ugc")} className="rounded-2xl border border-slate-200 bg-white p-4 text-left hover:border-violet-300"><WandSparkles className="text-slate-600"/><div className="mt-2 font-semibold">UGC / campaign shot</div><div className="text-xs text-slate-600">Direct-to-camera, newsroom, accident scenario, or cinematic creative.</div></button></div>

    <div className="mb-2 text-xs uppercase tracking-wider text-slate-500">Video engine</div><div className="grid gap-3 md:grid-cols-4">{providers.map(p => { const I=p.icon, active=provider===p.id, configured=settings?.providers?.[p.id]?.keyConfigured; return <button key={p.id} onClick={() => { setProvider(p.id); setError(null); }} className={`rounded-2xl border p-4 text-left transition ${active?"border-violet-400 bg-violet-50 ring-1 ring-violet-200":"border-slate-200 bg-white hover:border-violet-300"}`}><I className={active?"text-violet-600":"text-slate-500"}/><div className="mt-2 font-medium">{p.label}</div><div className="text-xs text-slate-500">{p.cap}{configured===false?" · key needed":""}</div></button>; })}</div>

    <div className="mb-2 mt-6 text-xs uppercase tracking-wider text-slate-500">Campaign type</div><div className="grid gap-3 md:grid-cols-5">{modes.map(m => { const I=m.icon, active=category===m.id; return <button key={m.id} onClick={() => setCategory(m.id)} className={`rounded-2xl border p-4 text-left transition ${active?"border-violet-400 bg-violet-50":"border-slate-200 bg-white hover:border-violet-300"}`}><I/><div className="mt-2 font-medium">{m.title}</div><div className="text-xs text-slate-500">{m.sub}</div></button>; })}</div>

    {error && <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

    <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
      <div className="soro-card p-5"><div className="grid gap-4">
        <label className="grid gap-2 text-sm"><span className="font-medium text-slate-700">Mission</span><Textarea value={mission} onChange={e=>setMission(e.target.value)} placeholder="What should this content accomplish?"/></label>
        <label className="grid gap-2 text-sm"><span className="font-medium text-slate-700">Subject / spokesperson direction</span><Input value={subject} onChange={e=>setSubject(e.target.value)} placeholder="Who or what should appear?"/></label>
        <label className="grid gap-2 text-sm"><span className="font-medium text-slate-700">Exact dialogue (optional)</span><Textarea value={script} onChange={e=>setScript(e.target.value)} placeholder="Spoken copy, if the provider supports it"/></label>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800"><UserRound size={16}/>Spokesperson / reference</div><label className="grid gap-2 text-sm"><span className="font-medium text-slate-700">Choose canonical avatar</span><select aria-label="Choose canonical avatar" value={selectedAvatar} onChange={e=>chooseAvatar(e.target.value)} disabled={loadingAvatar} className="h-11 rounded-xl border border-slate-200 bg-white px-3"><option value="">No avatar · use uploaded reference</option>{avatars.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>{selectedAvatar&&<div className="mt-2 text-xs text-emerald-700">Loaded canonical image for {avatars.find(a=>a.id===selectedAvatar)?.name}.</div>}<div className="my-3 flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-400"><span className="h-px flex-1 bg-slate-200"/>or upload one-off reference<span className="h-px flex-1 bg-slate-200"/></div><label className="grid gap-2 text-sm"><span className="font-medium text-slate-700">Reference image {provider === "hedra" ? "(required if no avatar selected)" : "(optional)"}</span><div className="flex items-center gap-3"><Input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>chooseImage(e.target.files?.[0])}/><Upload size={18}/></div>{image&&<span className="text-xs text-emerald-700">Using: {image.name}</span>}</label></div>

        {provider === "hedra" && <div className="grid gap-4 rounded-xl border border-violet-200 bg-violet-50 p-4"><label className="grid gap-1 text-sm"><span className="font-medium text-violet-900">Hedra duration</span><select value={hedraDuration} onChange={e=>setHedraDuration(Number(e.target.value) as 15|30)} className="h-11 rounded-xl border border-violet-200 bg-white px-3"><option value={15}>15 seconds</option><option value={30}>30 seconds</option></select></label><label className="grid gap-2 text-sm"><span className="font-medium text-violet-900">Driving audio (required)</span><Input type="file" accept="audio/*" onChange={e=>chooseAudio(e.target.files?.[0])}/>{audio&&<span className="text-xs text-emerald-700">Loaded: {audio.name}</span>}<span className="text-xs text-violet-700">Character/Avatar models animate the selected canonical identity from this audio.</span></label></div>}
        <Button size="lg" disabled={busy || loadingAvatar || !hedraReady} onClick={generate}><Play size={17} className="mr-2"/>{busy?`Starting ${selected.label}…`:`Generate ${durationSeconds}s with ${selected.label}`}</Button>
      </div></div>

      <div className="soro-card min-h-[470px] p-5"><div className="mb-4 flex items-start justify-between gap-3"><div><div className="font-medium">Output</div><div className="text-xs text-slate-500">{durationSeconds}s · {selected.label} · provider-specific generation</div></div>{job&&<span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase">{job.status}</span>}</div>{!job&&<div className="grid h-[330px] place-items-center rounded-xl border border-dashed border-slate-200 text-center text-sm text-slate-500">Generated video appears here.</div>}{job?.status==="failed"&&<div className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{job.error}</div>}{job&&!["succeeded","failed"].includes(job.status)&&<div className="grid h-[330px] place-items-center text-sm"><div className="text-center"><div className="mx-auto mb-3 h-9 w-9 animate-spin rounded-full border-2 border-slate-200 border-t-violet-600"/>{selected.label} is generating…</div></div>}{job?.status==="succeeded"&&job.fileUrl&&<div><video src={job.fileUrl} className="max-h-[430px] w-full rounded-xl bg-black" controls autoPlay playsInline/><div className="mt-4 flex flex-wrap items-center gap-2"><Button onClick={sendToCalendar} disabled={scheduleState!=="idle"}><CalendarPlus size={15} className="mr-2"/>{scheduleState==="saved"?"Added to Calendar":scheduleState==="saving"?"Adding…":"Send to approval Calendar"}</Button><Button variant="secondary" onClick={postToInstagram} disabled={instagramState!=="idle"}><Instagram size={15} className="mr-2"/>{instagramState==="posted"?"Posted to Instagram":instagramState==="posting"?"Publishing…":"Post to Instagram now"}</Button>{scheduleState==="saved"&&<Link href="/calendar" className="text-sm font-medium text-violet-700 hover:underline">Review scheduled post →</Link>}</div></div>}</div>
    </div>
  </main>;
}
