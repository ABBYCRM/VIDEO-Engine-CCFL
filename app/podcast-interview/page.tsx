"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AudioLines, CalendarPlus, ImagePlus, Mic2, Play, RefreshCcw, Sparkles, Upload, WandSparkles } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { Button } from "@/components/ui/button";

type ProviderId = "hedra" | "grok" | "veo" | "a2e";
type Job = { id:string; status:string; error?:string; fileUrl?:string|null; provider?:ProviderId };

function fileToBase64(file: File) {
  return new Promise<string>((resolve,reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
    reader.readAsDataURL(file);
  });
}

export default function PodcastInterviewPage() {
  const [topUrl,setTopUrl] = useState<string|null>(null);
  const [split,setSplit] = useState(33);
  const [relationship,setRelationship] = useState("mixed");
  const [mission,setMission] = useState("");
  const [tone,setTone] = useState("natural, conversational, confident");
  const [hook,setHook] = useState("");
  const [script,setScript] = useState("");
  const [captions,setCaptions] = useState<string[]>([]);
  const [postCaption,setPostCaption] = useState("");
  const [provider,setProvider] = useState<ProviderId>("hedra");
  const [durationSeconds,setDurationSeconds] = useState(30);
  const [audioName,setAudioName] = useState("");
  const [audioBase64,setAudioBase64] = useState<string|null>(null);
  const [audioMimeType,setAudioMimeType] = useState<string|null>(null);
  const [avatarPrompt,setAvatarPrompt] = useState("Photorealistic adult podcast host, natural skin texture, expressive eyes, professional casual clothing, seated in a modern podcast studio, realistic soft lighting, chest-up portrait, camera at eye level");
  const [avatarBase64,setAvatarBase64] = useState<string|null>(null);
  const [avatarModel,setAvatarModel] = useState("black-forest-labs/flux.1-schnell");
  const [writing,setWriting] = useState(false);
  const [generatingAvatar,setGeneratingAvatar] = useState(false);
  const [generating,setGenerating] = useState(false);
  const [job,setJob] = useState<Job|null>(null);
  const [scheduleState,setScheduleState] = useState<"idle"|"saving"|"saved">("idle");
  const [error,setError] = useState<string|null>(null);

  useEffect(() => () => { if (topUrl) URL.revokeObjectURL(topUrl); }, [topUrl]);
  useEffect(() => {
    if (!job?.id || ["succeeded","failed"].includes(job.status)) return;
    const timer = setInterval(async () => {
      const r = await fetch(`/api/v1/video/${job.id}`, { cache:"no-store" });
      if (r.ok) { const d=await r.json(); setJob(j => ({ ...(j || {}), ...d } as Job)); }
    }, 4000);
    return () => clearInterval(timer);
  }, [job?.id,job?.status]);

  const bottomHeight = 100-split;
  const targetSeconds = provider === "hedra" ? durationSeconds : provider === "grok" ? 15 : 8;
  const canGenerate = Boolean(script.trim() && avatarBase64 && (provider !== "hedra" || audioBase64) && !generating);

  function chooseTop(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("video/")) { setError("Choose a video file."); return; }
    if (file.size > 200*1024*1024) { setError("Top video must be 200MB or smaller for browser preview."); return; }
    if (topUrl) URL.revokeObjectURL(topUrl);
    setTopUrl(URL.createObjectURL(file));
    setError(null);
  }

  async function chooseAudio(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("audio/")) { setError("Choose an audio file for Hedra."); return; }
    if (file.size > 105*1024*1024) { setError("Hedra driving audio must be 105MB or smaller."); return; }
    try {
      setAudioBase64(await fileToBase64(file));
      setAudioMimeType(file.type || "audio/mpeg");
      setAudioName(file.name);
      setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  async function writeWithAi() {
    setWriting(true); setError(null);
    try {
      const r=await fetch("/api/internal/ugc/write", {
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({ mission,tone,contextMode:relationship,targetSeconds })
      });
      const d=await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setScript(d.script || ""); setHook(d.hook || ""); setCaptions(d.captions || []); setPostCaption(d.postCaption || "");
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setWriting(false); }
  }

  async function generateAvatar() {
    setGeneratingAvatar(true); setError(null);
    try {
      const r=await fetch("/api/internal/nvidia/image", {
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({ prompt:avatarPrompt, model:avatarModel })
      });
      const d=await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setAvatarBase64(d.base64); setAvatarModel(d.model || avatarModel);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setGeneratingAvatar(false); }
  }

  async function generateVideo() {
    if (!canGenerate) return;
    setGenerating(true); setError(null); setJob(null); setScheduleState("idle");
    try {
      const subject="Adult podcast host matching the supplied reference portrait. Chest-up framing in a realistic podcast studio with microphone visible. Maintain identity, wardrobe, lighting and camera position throughout.";
      const missionText=`Podcast-style UGC commentary. Relationship to the upper contextual video: ${relationship}. ${mission}`.slice(0,3900);
      const r=await fetch("/api/internal/generate", {
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({
          provider,
          category:"ugc",
          mission:missionText,
          subject,
          script,
          aspectRatio:"9:16",
          resolution:"1080p",
          durationSeconds:targetSeconds,
          imageBase64:avatarBase64,
          imageMimeType:"image/png",
          audioBase64:provider === "hedra" ? audioBase64 : undefined,
          audioMimeType:provider === "hedra" ? audioMimeType : undefined
        })
      });
      const d=await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setJob({ ...d.job, provider });
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setGenerating(false); }
  }

  async function sendToCalendar() {
    if (!job?.id || job.status !== "succeeded") return;
    setScheduleState("saving"); setError(null);
    try {
      const r=await fetch("/api/calendar", {
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({
          title:`Podcast commentary · ${provider}`,
          network:"instagram",
          scheduledAt:new Date(Date.now()+24*60*60*1000).toISOString(),
          status:"pending",
          autoPost:false,
          contentType:"podcast",
          caption:postCaption || mission || script,
          videoJobId:job.id
        })
      });
      const d=await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setScheduleState("saved");
    } catch (e) { setScheduleState("idle"); setError(e instanceof Error ? e.message : String(e)); }
  }

  return <AuthGuard><AppShell><main>
    <div className="mb-6">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-violet-700"><Mic2 size={16}/> Create · Podcast / split-screen</div>
      <h1 className="text-[34px] font-semibold leading-tight tracking-tight text-slate-900">Podcast Composer</h1>
      <p className="mt-1 max-w-3xl text-sm text-slate-600">Upload the source clip, write the post with NVIDIA, generate the host reference, choose any configured video engine, then send the completed post to Calendar for owner approval or auto-post.</p>
    </div>

    {error && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div><div className="font-semibold text-slate-900">Live 9:16 composition</div><div className="text-xs text-slate-500">Top {split}% source · Bottom {bottomHeight}% AI host</div></div>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50"><Upload size={14}/>Choose top video<input className="hidden" type="file" accept="video/*" onChange={e=>chooseTop(e.target.files?.[0])}/></label>
        </div>
        <div className="mx-auto aspect-[9/16] w-full max-w-[470px] overflow-hidden rounded-2xl bg-black shadow-sm" aria-label="Podcast composition preview">
          <div style={{height:`${split}%`}} className="relative overflow-hidden border-b border-white/20 bg-slate-900">
            {topUrl ? <video src={topUrl} autoPlay muted loop playsInline controls className="h-full w-full object-cover"/> : <div className="grid h-full place-items-center p-6 text-center text-sm text-slate-300"><div><Upload className="mx-auto mb-2"/>Upload the contextual source video</div></div>}
            {hook && <div className="pointer-events-none absolute inset-x-3 bottom-2 text-center text-xl font-black uppercase leading-tight text-white [text-shadow:0_2px_5px_rgba(0,0,0,.85)]">{hook}</div>}
          </div>
          <div style={{height:`${bottomHeight}%`}} className="relative overflow-hidden bg-slate-950">
            {job?.status === "succeeded" && job.fileUrl ? <video src={job.fileUrl} autoPlay loop playsInline controls className="h-full w-full object-cover"/> : avatarBase64 ? <img src={`data:image/png;base64,${avatarBase64}`} alt="Generated AI host" className="h-full w-full object-cover"/> : <div className="grid h-full place-items-center p-6 text-center text-sm text-slate-400">Generate the avatar reference to preview the host.</div>}
            {job && !["succeeded","failed"].includes(job.status) && <div className="absolute inset-0 grid place-items-center bg-black/60 text-sm text-white"><div className="text-center"><RefreshCcw className="mx-auto mb-2 animate-spin"/>Generating {provider} talking head…</div></div>}
            {captions.length>0 && <div className="pointer-events-none absolute inset-x-4 bottom-5 text-center"><span className="rounded-lg bg-black/75 px-2 py-1 text-base font-bold text-white">{captions[0]}</span></div>}
          </div>
        </div>
        <label className="mx-auto mt-4 block max-w-[470px] text-xs font-medium text-slate-600">Top video height: {split}%<input type="range" min="25" max="45" value={split} onChange={e=>setSplit(Number(e.target.value))} className="mt-2 w-full"/></label>
        {job?.status === "succeeded" && <div className="mx-auto mt-4 flex max-w-[470px] flex-wrap items-center gap-2"><Button onClick={sendToCalendar} disabled={scheduleState !== "idle"}><CalendarPlus size={15} className="mr-2"/>{scheduleState === "saved" ? "Added to Calendar" : scheduleState === "saving" ? "Adding…" : "Send to approval Calendar"}</Button>{scheduleState === "saved" && <Link href="/calendar" className="text-sm font-medium text-violet-700 hover:underline">Review post →</Link>}</div>}
      </section>

      <aside className="grid content-start gap-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center gap-2 font-semibold text-slate-900"><Sparkles size={16} className="text-violet-600"/>1. Write post</div>
          <label className="grid gap-1 text-xs font-medium text-slate-600">Mission<textarea rows={4} value={mission} onChange={e=>setMission(e.target.value)} placeholder={`What should this ${targetSeconds}-second commentary accomplish?`} className="rounded-xl border border-slate-200 p-3 text-sm text-slate-900"/></label>
          <div className="mt-3 grid grid-cols-2 gap-2"><label className="grid gap-1 text-xs font-medium text-slate-600">Relationship<select value={relationship} onChange={e=>setRelationship(e.target.value)} className="h-10 rounded-xl border border-slate-200 px-2 text-sm"><option value="related">Related</option><option value="unrelated">Unrelated</option><option value="ironic">Ironic</option><option value="mixed">Mixed</option></select></label><label className="grid gap-1 text-xs font-medium text-slate-600">Tone<input value={tone} onChange={e=>setTone(e.target.value)} className="h-10 rounded-xl border border-slate-200 px-2 text-sm"/></label></div>
          <Button className="mt-3 w-full" onClick={writeWithAi} disabled={writing || !mission.trim()}>{writing ? <><RefreshCcw size={14} className="mr-2 animate-spin"/>Writing…</> : <><WandSparkles size={14} className="mr-2"/>Write script + captions</>}</Button>
          <label className="mt-3 grid gap-1 text-xs font-medium text-slate-600">Hook<input value={hook} onChange={e=>setHook(e.target.value)} className="h-10 rounded-xl border border-slate-200 px-2 text-sm"/></label>
          <label className="mt-3 grid gap-1 text-xs font-medium text-slate-600">{targetSeconds}-second spoken script<textarea rows={5} value={script} onChange={e=>setScript(e.target.value)} className="rounded-xl border border-slate-200 p-3 text-sm text-slate-900"/></label>
          {postCaption && <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600"><strong>Post caption:</strong> {postCaption}</div>}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center gap-2 font-semibold text-slate-900"><ImagePlus size={16} className="text-violet-600"/>2. Avatar reference</div>
          <label className="grid gap-1 text-xs font-medium text-slate-600">NVIDIA image model<select value={avatarModel} onChange={e=>setAvatarModel(e.target.value)} className="h-10 rounded-xl border border-slate-200 px-2 text-sm"><option value="black-forest-labs/flux.1-schnell">FLUX.1 Schnell · draft</option><option value="black-forest-labs/flux.2-klein-4b">FLUX.2 Klein 4B · quality</option></select></label>
          <label className="mt-3 grid gap-1 text-xs font-medium text-slate-600">Avatar prompt<textarea rows={4} value={avatarPrompt} onChange={e=>setAvatarPrompt(e.target.value)} className="rounded-xl border border-slate-200 p-3 text-sm text-slate-900"/></label>
          <Button variant="secondary" className="mt-3 w-full" onClick={generateAvatar} disabled={generatingAvatar || !avatarPrompt.trim()}>{generatingAvatar ? <><RefreshCcw size={14} className="mr-2 animate-spin"/>Generating…</> : <><Sparkles size={14} className="mr-2"/>{avatarBase64 ? "Regenerate avatar" : "Generate avatar"}</>}</Button>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center gap-2 font-semibold text-slate-900"><Play size={16} className="text-violet-600"/>3. Video engine</div>
          <label className="grid gap-1 text-xs font-medium text-slate-600">Provider<select value={provider} onChange={e=>{setProvider(e.target.value as ProviderId);setJob(null);setScheduleState("idle");}} className="h-10 rounded-xl border border-slate-200 px-2 text-sm"><option value="hedra">Hedra Character 3 · 15/30s</option><option value="grok">Grok Imagine · up to 15s</option><option value="veo">Gemini / Veo · 8s</option><option value="a2e">A2E router · model dependent</option></select></label>
          {provider === "hedra" && <><label className="mt-3 grid gap-1 text-xs font-medium text-slate-600">Duration<select value={durationSeconds} onChange={e=>setDurationSeconds(Number(e.target.value))} className="h-10 rounded-xl border border-slate-200 px-2 text-sm"><option value={15}>15 seconds</option><option value={30}>30 seconds</option></select></label><label className="mt-3 flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3 py-3 text-sm font-medium hover:bg-slate-50"><AudioLines size={15}/><span className="min-w-0 flex-1 truncate">{audioName || "Upload driving audio"}</span><input className="hidden" type="file" accept="audio/*" onChange={e=>chooseAudio(e.target.files?.[0])}/></label><p className="mt-2 text-[11px] text-slate-500">Hedra Character/Avatar requires driving audio plus the generated start image.</p></>}
          <Button className="mt-3 w-full bg-violet-600 text-white hover:bg-violet-700" onClick={generateVideo} disabled={!canGenerate}>{generating ? "Starting…" : `Generate ${targetSeconds}s ${provider} video`}</Button>
          {!avatarBase64 && <p className="mt-2 text-[11px] text-amber-700">Generate an avatar reference first.</p>}
          {provider === "hedra" && !audioBase64 && <p className="mt-1 text-[11px] text-amber-700">Upload driving audio before generating.</p>}
          {job?.status === "failed" && <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">{job.error}</div>}
        </section>
      </aside>
    </div>
  </main></AppShell></AuthGuard>;
}
