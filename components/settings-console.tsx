"use client";
import { useEffect, useState } from "react";
import { KeyRound, Save, Copy, Trash2, Shield, Sparkles, Atom, Cloud, Bird, RefreshCcw, Cpu, BookOpen, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ModelSelector, ModelSelectorTrigger, ModelSelectorValue, ModelSelectorContent, type AiModel, type AiModelSelection } from "@/components/ui/ai-model-select";
import { InstagramGraphCard } from "@/components/instagram-graph-card";

type TokenRow = { id:string; name:string; prefix:string; createdAt:string; lastUsedAt?:string|null; revokedAt?:string|null };
type ProviderId = "veo" | "grok" | "a2e" | "hedra";
type ImageProviderId = "hedra" | "gemini" | "openai" | "xai" | "a2e" | "mock";

type LiveRow = {
  id: ProviderId | "nvidia";
  label: string;
  configured: boolean;
  live: boolean;
  status: number | null;
  latencyMs: number | null;
  error: string | null;
  checkedAt: string;
  model?: string | null;
};

const providerMeta: Record<ProviderId, { label: string; icon: any; choices: string[]; help: string; docs?: string }> = {
  veo: {
    label: "Google Veo 3.1 (direct)",
    icon: Sparkles,
    choices: ["veo-3.1-generate-preview", "veo-3.1-fast-generate-preview", "veo-3.1-lite-generate-preview"],
    help: "Google Gemini API key. Save it under Settings — never commit."
  },
  grok: {
    label: "xAI Grok Imagine",
    icon: Atom,
    choices: ["grok-imagine-video-1.5", "grok-imagine-video-1.0"],
    help: "xAI API key from console.x.ai. Routes through https://api.x.ai/v1/videos/generations."
  },
  a2e: {
    label: "A2E AI multi-model router",
    icon: Cloud,
    choices: ["veo3", "veo3_fast", "wan", "wan-3.0", "kling", "seedance", "sora"],
    help: "A2E AI key from video.a2e.ai. Single key unlocks Veo 3.1, Wan, Kling, Seedance, Sora under one billing."
  },
  hedra: {
    label: "Hedra (v3 multi-model)",
    icon: Bird,
    choices: ["fal/grok-video-i2v", "fal/grok-video-t2v", "hedra-character-3", "hedra-character-2", "together/hedra-avatar"],
    help: "Hedra API key from hedra.com/develop/api-keys. Single key unlocks Character-3, Hedra Avatar, and the fal/grok-video models on Hedra's v3 platform.",
    docs: "https://www.hedra.com/docs/pages/developer/v3/quickstart"
  }
};

// Map the NVIDIA_MODELS list from the server's live endpoint into the
// ModelSelector's AiModel shape. The server already provides id / label /
// notes; we derive effort / context / fast / thinking defaults so the picker
// behaves the same for every model.
function nvidiaModelAdapter(choice: { id: string; label: string; notes: string }): AiModel {
  const id = choice.id;
  return {
    id,
    label: choice.label,
    description: choice.notes,
    efforts: ["high", "medium", "low"],
    contexts: ["8K", "16K", "32K", "64K", "128K"],
    supportsFast: true,
    supportsThinking: id.includes("nemotron") || id.includes("llama") || id.includes("mistral"),
    defaultEffort: id === "nvidia/nemotron-mini-4b-instruct" ? "low" : "high",
    defaultContext: "16K",
    defaultFast: id !== "nvidia/nemotron-mini-4b-instruct",
    disabled: id === "disabled"
  };
}

export function SettingsConsole(){
 const [settings,setSettings] = useState<any>(null);
 const [gemini,setGemini] = useState("");
 const [xai,setXai] = useState("");
 const [a2e,setA2e] = useState("");
 const [hedraKey,setHedraKey] = useState("");
 const [nvidiaKey,setNvidiaKey] = useState("");
 const [steelKey,setSteelKey] = useState("");
 const [defaultProvider,setDefaultProvider] = useState<ProviderId>("hedra");
 const [providerModels,setProviderModels] = useState<Record<ProviderId,string>>({ veo:"", grok:"", a2e:"", hedra:"" });
 const [imageProvider,setImageProvider] = useState<ImageProviderId>("hedra");
 const [imageModel,setImageModel] = useState<string>("gpt-image-2");
 const [imageBusy,setImageBusy] = useState(false);
 const [imageMsg,setImageMsg] = useState<string|null>(null);
 const [nvidiaModels,setNvidiaModels] = useState<{ id:string; label:string; notes:string }[]>([]);
 const [nvidiaSelection,setNvidiaSelection] = useState<AiModelSelection>({ id: "meta/llama-3.1-70b-instruct", effort: "high", context: "16K", fast: true });
 const [resolution,setResolution] = useState("1080p");
 const [aspectRatio,setAspectRatio] = useState("9:16");
 const [tokens,setTokens] = useState<TokenRow[]>([]);
 const [name,setName] = useState("");
 const [newToken,setNewToken] = useState<string|null>(null);
 const [live,setLive] = useState<Record<string, LiveRow | null>>({ veo:null, grok:null, a2e:null, hedra:null, nvidia:null });
 const [liveBusy,setLiveBusy] = useState(false);

 async function load(){
   const [s,t] = await Promise.all([fetch("/api/admin/settings"), fetch("/api/admin/tokens")]);
   if(s.ok){
     const d = await s.json();
     setSettings(d);
     setDefaultProvider(d.defaultProvider || "hedra");
     setProviderModels({
       veo: d.providers?.veo?.model || providerMeta.veo.choices[0],
       grok: d.providers?.grok?.model || providerMeta.grok.choices[0],
       a2e: d.providers?.a2e?.model || providerMeta.a2e.choices[0],
       hedra: d.providers?.hedra?.model || providerMeta.hedra.choices[0]
     });
     const sel = d.nvidia?.model || "meta/llama-3.1-70b-instruct";
     setNvidiaSelection((prev) => ({ ...prev, id: sel }));
     setResolution(d.resolution || "1080p");
     setAspectRatio(d.aspectRatio || "9:16");
   }
   if(t.ok) setTokens((await t.json()).tokens);
 }
 useEffect(()=>{ load(); },[]);

 async function loadLive(){
   setLiveBusy(true);
   try {
     const r = await fetch("/api/admin/providers/live");
     if(r.ok){
       const d = await r.json();
       const next: Record<string, LiveRow | null> = { veo:null, grok:null, a2e:null, hedra:null, nvidia:null };
       for (const row of d.providers as LiveRow[]) next[row.id] = row;
       if (Array.isArray(d.nvidiaModelChoices)) setNvidiaModels(d.nvidiaModelChoices);
       setLive(next);
     }
   } finally {
     setLiveBusy(false);
   }
 }
 useEffect(()=>{ if(settings) loadLive(); },[settings?.providers?.hedra?.keyConfigured, settings?.nvidia?.keyConfigured]);

 async function loadImageProvider(){
   const r = await fetch("/api/admin/image-provider", { cache: "no-store" });
   if(!r.ok) return;
   const d = await r.json();
   if(d.provider) setImageProvider(d.provider as ImageProviderId);
   if(d.model) setImageModel(d.model);
 }
 useEffect(()=>{ loadImageProvider(); },[]);

 async function saveImageProvider(){
   setImageBusy(true);setImageMsg(null);
   try {
     const r = await fetch("/api/admin/image-provider", { method: "POST", headers: {"content-type":"application/json"}, body: JSON.stringify({ provider: imageProvider, model: imageModel }) });
     const d = await r.json();
     if(!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
     setImageMsg(`Saved: ${d.provider} · ${d.model}`);
     await loadImageProvider();
   } catch(e){
     setImageMsg(e instanceof Error ? e.message : String(e));
   } finally {
     setImageBusy(false);
   }
 }

 async function save(){
   const r = await fetch("/api/admin/settings", { method: "PUT", headers: {"content-type":"application/json"},
     body: JSON.stringify({
       geminiApiKey: gemini || undefined,
       xaiApiKey: xai || undefined,
       a2eApiKey: a2e || undefined,
       hedraApiKey: hedraKey || undefined,
       nvidiaApiKey: nvidiaKey || undefined,
       nvidiaModel: nvidiaSelection.id,
       steelApiKey: steelKey || undefined,
       defaultProvider,
       veoModel: providerModels.veo,
       grokModel: providerModels.grok,
       a2eModel: providerModels.a2e,
       hedraModel: providerModels.hedra,
       resolution,
       aspectRatio
     })
   });
   if(r.ok){
     setSettings(await r.json());
     setGemini(""); setXai(""); setA2e(""); setHedraKey(""); setNvidiaKey(""); setSteelKey("");
     alert("Settings saved");
     loadLive();
   }
   else { const d = await r.json(); alert(d.error || "Save failed"); }
 }

 async function createToken(){
   const r = await fetch("/api/admin/tokens", { method:"POST", headers:{"content-type":"application/json"}, body: JSON.stringify({ name }) });
   const d = await r.json();
   if(r.ok){ setNewToken(d.token); setName(""); load(); } else alert(d.error);
 }
 async function revoke(id:string){ await fetch(`/api/admin/tokens/${id}`, { method:"DELETE" }); load(); }

 if(!settings) return <div className="p-8 text-slate-600">Loading settings…</div>;

 const ALL_PROVIDERS: ProviderId[] = ["hedra","a2e","grok","veo"];

 return <div className="mx-auto min-w-0 max-w-5xl">

   <div className="mt-2 flex min-w-0 flex-col gap-6">

     <Card className="p-5">
       <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
         <div className="flex items-center gap-2 font-medium"><Shield size={18} className="text-cyan-700"/>Default video provider</div>
         <Button variant="ghost" size="sm" onClick={loadLive} disabled={liveBusy}>
           <RefreshCcw size={14} className={liveBusy ? "mr-1 animate-spin" : "mr-1"}/>Re-check live status
         </Button>
       </div>
       <div className="grid gap-3 md:grid-cols-2">
         {ALL_PROVIDERS.map((p) => {
           const M = providerMeta[p];
           const I = M.icon;
           const active = defaultProvider === p;
           const configured = settings.providers?.[p]?.keyConfigured;
           const L = live[p];
           const dot = L ? (L.configured && L.live ? "green" : L.configured ? "red" : "amber") : "unknown";
           return (
             <button key={p} onClick={() => setDefaultProvider(p)}
               className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition ${active ? "border-violet-400 bg-violet-50" : "border-slate-200 bg-white/80 hover:border-slate-600"}`}>
               <I className={active ? "text-cyan-700" : "text-slate-600"} />
               <div className="flex-1">
                 <div className="flex items-center gap-2">
                   <div className="font-medium">{M.label}</div>
                   {configured && <span className="rounded-full border border-emerald-500/40 bg-emerald-500/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-emerald-700">configured</span>}
                 </div>
                 <div className="mt-0.5 text-xs text-slate-500">{active ? "Default for new jobs" : "Click to make default"}</div>
               </div>
               <LiveDot state={dot} latency={L?.latencyMs ?? null} status={L?.status ?? null} error={L?.error ?? null} />
             </button>
           );
         })}
       </div>
     </Card>

     <Card className="p-5">
       <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
         <div className="flex items-center gap-2 font-medium"><ImageIcon size={18} className="text-cyan-700"/>Default image provider</div>
         <Button variant="ghost" size="sm" onClick={() => { loadImageProvider(); setImageMsg(null); }}>
           <RefreshCcw size={14} className="mr-1"/>Reload
         </Button>
       </div>
       <p className="mb-4 text-xs text-slate-500">Powers the campaign hero still and the 4-view avatar turnaround. Hedra is the default — 75+ image models behind one v3 endpoint, ~3.5¢ per generation. Same key as the Hedra video provider above.</p>
       <div className="grid gap-3 md:grid-cols-2">
         <label className="grid gap-2 text-sm">
           <span className="font-medium">Provider</span>
           <select className="h-11 rounded-xl border border-slate-200 bg-white px-3" value={imageProvider} onChange={e => {
             const p = e.target.value as ImageProviderId;
             setImageProvider(p);
             // Snap model to the first valid choice for the new provider
             const defaults: Record<ImageProviderId,string> = { hedra: "gpt-image-2", gemini: "gemini-2.5-flash-image", openai: "gpt-image-1", xai: "grok-imagine-image", a2e: "gpt-image-1.5", mock: "mock-stable-diffusion-1" };
             setImageModel(defaults[p]);
           }}>
             <option value="hedra">Hedra multi-model image (gpt-image-2, flux2-max, imagen-4, seedream-5, ideogram-v4, recraft-v3)</option>
             <option value="gemini">Google Gemini image generation</option>
             <option value="a2e">A2E GPT Image (gpt-image-1.5 / gpt-image-2)</option>
             <option value="openai">OpenAI image generation (gpt-image-1, dall-e-3)</option>
             <option value="xai">xAI Grok Imagine (text-to-image only)</option>
             <option value="mock">Mock placeholder (dev only)</option>
           </select>
         </label>
         <label className="grid gap-2 text-sm">
           <span className="font-medium">Model</span>
           <select className="h-11 rounded-xl border border-slate-200 bg-white px-3" value={imageModel} onChange={e => setImageModel(e.target.value)}>
             {imageProvider === "hedra" && (<>
               <option value="gpt-image-2">gpt-image-2</option>
               <option value="flux2-max">flux2-max (FLUX.2 [max])</option>
               <option value="flux-kontext">flux-kontext</option>
               <option value="nano-banana-pro">nano-banana-pro (Imagen)</option>
               <option value="imagen-4">imagen-4</option>
               <option value="seedream-5">seedream-5</option>
               <option value="ideogram-v4">ideogram-v4</option>
               <option value="recraft-v3">recraft-v3</option>
             </>)}
             {imageProvider === "gemini" && (<>
               <option value="gemini-2.5-flash-image">gemini-2.5-flash-image</option>
               <option value="gemini-3.1-flash-image-preview">gemini-3.1-flash-image-preview</option>
               <option value="gemini-3.1-flash-image">gemini-3.1-flash-image</option>
               <option value="gemini-3.1-flash-lite-image">gemini-3.1-flash-lite-image</option>
             </>)}
             {imageProvider === "openai" && (<>
               <option value="gpt-image-1">gpt-image-1</option>
               <option value="dall-e-3">dall-e-3</option>
             </>)}
             {imageProvider === "xai" && (<>
               <option value="grok-imagine-image">grok-imagine-image</option>
               <option value="grok-imagine-image-2.0">grok-imagine-image-2.0</option>
               <option value="grok-imagine-image-quality">grok-imagine-image-quality</option>
             </>)}
             {imageProvider === "a2e" && (<>
               <option value="gpt-image-1.5">gpt-image-1.5</option>
               <option value="gpt-image-2">gpt-image-2</option>
             </>)}
             {imageProvider === "mock" && <option value="mock-stable-diffusion-1">mock-stable-diffusion-1</option>}
           </select>
         </label>
       </div>
       <div className="mt-4 flex items-center gap-3">
         <Button onClick={saveImageProvider} disabled={imageBusy}>
           {imageBusy ? <RefreshCcw size={14} className="mr-2 animate-spin"/> : <Save size={14} className="mr-2"/>}
           Save image provider
         </Button>
         {imageMsg && <span className="text-xs text-slate-600">{imageMsg}</span>}
       </div>
     </Card>

     <Card className="p-5">
       <div className="mb-4 flex items-center gap-2 font-medium"><KeyRound size={18} className="text-cyan-700"/>Provider credentials</div>
       <div className="grid gap-5">
         {ALL_PROVIDERS.map((p) => {
           const M = providerMeta[p];
           const I = M.icon;
           const configured = settings.providers?.[p]?.keyConfigured;
           const setKey = p === "veo" ? setGemini : p === "grok" ? setXai : p === "a2e" ? setA2e : setHedraKey;
           const L = live[p];
           const dot = L ? (L.configured && L.live ? "green" : L.configured ? "red" : "amber") : "unknown";
           return (
             <div key={p} className="grid gap-3 rounded-xl border border-slate-200 bg-white/70 p-4">
               <div className="flex items-center justify-between">
                 <div className="flex items-center gap-2">
                   <I size={18} className="text-cyan-700" />
                   <div className="font-medium">{M.label}</div>
                   {configured && <span className="rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-emerald-700">configured</span>}
                 </div>
                 <LiveDot state={dot} latency={L?.latencyMs ?? null} status={L?.status ?? null} error={L?.error ?? null} compact />
               </div>
               <p className="text-xs text-slate-500">{M.help}</p>
               <div className="grid gap-3 md:grid-cols-2">
                 <label className="grid gap-2 text-sm">
                   <span>{M.label} API key</span>
                   <Input type="password" placeholder="•••••• paste to replace" onChange={e => setKey(e.target.value)} />
                 </label>
                 <label className="grid gap-2 text-sm">
                   <span>Model</span>
                   <select className="h-11 rounded-xl border border-slate-200 bg-white px-3" value={providerModels[p]} onChange={e => setProviderModels(m => ({ ...m, [p]: e.target.value }))}>
                     {M.choices.map(c => <option key={c} value={c}>{c}</option>)}
                   </select>
                 </label>
               </div>
             </div>
           );
         })}
       </div>
     </Card>

     <Card className="p-5">
       <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
         <div className="flex items-center gap-2 font-medium"><Cpu size={18} className="text-cyan-700"/>NVIDIA Content Intelligence + Performance Monitor</div>
         <LiveDot
           state={
             live.nvidia ? (live.nvidia.configured && live.nvidia.live ? "green" : live.nvidia.configured ? "red" : "amber") : "unknown"
           }
           latency={live.nvidia?.latencyMs ?? null}
           status={live.nvidia?.status ?? null}
           error={live.nvidia?.error ?? null}
           compact
         />
       </div>
       <p className="mb-3 text-sm text-slate-600">
         NVIDIA writes the social-media package (hook / captions / hashtags / platform variants) and — once ad metrics exist — feeds winning copy + prompts back into the engine. Not a video renderer; lives alongside Veo / Grok / A2E / Hedra.
       </p>
       <div className="grid gap-3 rounded-xl border border-slate-200 bg-white/70 p-4">
         <div className="grid gap-3 md:grid-cols-2">
           <label className="grid gap-2 text-sm">
             <span>NVIDIA NIM API key</span>
             <Input type="password" placeholder="nvapi-… paste to replace" onChange={e => setNvidiaKey(e.target.value)} />
             <span className="text-[11px] text-slate-500">
               Get one at <a className="text-cyan-700 underline-offset-2 hover:underline" href="https://build.nvidia.com" target="_blank" rel="noreferrer">build.nvidia.com</a>. Stored encrypted AES-256-GCM.
             </span>
           </label>
           <div className="grid gap-2 text-sm">
             <span>Model</span>
             {nvidiaModels.length === 0 ? (
               <div className="grid h-11 place-items-center rounded-xl border border-slate-200 bg-white text-xs text-slate-500">
                 Loading models…
               </div>
             ) : (
               <ModelSelector
                 models={nvidiaModels.map(nvidiaModelAdapter)}
                 value={nvidiaSelection}
                 onValueChange={setNvidiaSelection}
                 aria-label="NVIDIA NIM model"
               >
                 <ModelSelectorTrigger className="min-h-11 w-full min-w-0 justify-between rounded-xl border border-slate-200 bg-white px-3 text-sm">
                   <ModelSelectorValue className="text-sm" />
                 </ModelSelectorTrigger>
                 <ModelSelectorContent side="bottom" />
               </ModelSelector>
             )}
             <span className="text-[11px] text-slate-500">
               Currently selected: <code className="rounded bg-slate-100 px-1.5 py-0.5 text-cyan-700">{nvidiaSelection.id}</code>
             </span>
           </div>
         </div>
         <details className="text-xs text-slate-600">
           <summary className="flex cursor-pointer items-center gap-1 text-slate-800 hover:text-white"><BookOpen size={12}/>How NVIDIA is used in this build</summary>
           <ul className="ml-4 mt-2 list-disc space-y-1">
             <li><strong>Content Intelligence:</strong> writes a structured <code>SocialContentPackage</code> from a campaign's website + tone + platform + selected video. Hook, primaryText, shortCaption, longCaption, reelTitle, cta, hashtags, platform variants. Validated by schema before persisting.</li>
             <li><strong>Performance Monitor:</strong> analyzes ad-account metrics when they exist. Findings + recommendations cite the metric IDs. When no metrics are available, returns <code>status: "dormant"</code> — never fabricates ROI.</li>
             <li><strong>Why a model picker, not a fixed model:</strong> the content-writer + monitor ask the registry for the configured model id every call, so swapping models in Settings never touches call sites.</li>
           </ul>
         </details>
       </div>
     </Card>

     <Card className="p-5">
       <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
         <div className="flex items-center gap-2 font-medium"><Cloud size={18} className="text-slate-700"/>Steel.dev (Claw web research)</div>
         <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase ${settings?.steel?.configured ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{settings?.steel?.configured ? "configured" : "not configured"}</span>
       </div>
       <p className="mb-3 text-sm text-slate-600">
         Powers Claw's <code>steel_scrape</code> tool: renders a public web page and returns clean Markdown + metadata + links for live research. Local/private targets are always rejected server-side.
       </p>
       <label className="grid gap-2 text-sm">
         <span>Steel API key</span>
         <Input type="password" placeholder="ste-… paste to replace" onChange={e => setSteelKey(e.target.value)} />
         <span className="text-[11px] text-slate-500">
           Get one at <a className="text-cyan-700 underline-offset-2 hover:underline" href="https://steel.dev" target="_blank" rel="noreferrer">steel.dev</a>. Stored encrypted AES-256-GCM, same as every other provider key here.
         </span>
       </label>
     </Card>

     <InstagramGraphCard />

     <Card className="p-5">
       <div className="mb-4 font-medium">Default output</div>
       <div className="grid gap-4 md:grid-cols-3">
         <label className="grid gap-2 text-sm"><span>Resolution</span>
           <select className="h-11 rounded-xl border border-slate-200 bg-white px-3" value={resolution} onChange={e=>setResolution(e.target.value)}>
             <option>720p</option><option>1080p</option><option>4k</option>
           </select>
         </label>
         <label className="grid gap-2 text-sm"><span>Aspect ratio</span>
           <select className="h-11 rounded-xl border border-slate-200 bg-white px-3" value={aspectRatio} onChange={e=>setAspectRatio(e.target.value)}>
             <option>9:16</option><option>16:9</option>
           </select>
         </label>
         <div className="flex items-end">
           <Button onClick={save}><Save size={16} className="mr-2"/>Save settings</Button>
         </div>
       </div>
     </Card>

     <Card className="p-5">
       <div className="mb-4 font-medium">API tokens</div>
       <div className="grid gap-3 md:grid-cols-[1fr_auto]">
         <Input value={name} onChange={e=>setName(e.target.value)} placeholder="Token label (e.g. n8n pipeline)"/>
         <Button onClick={createToken} disabled={!name}>Create token</Button>
       </div>
       {newToken && <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-50 p-3 text-sm text-amber-800">Copy this token now — it is shown only once. <code className="ml-2 rounded bg-slate-100 px-2 py-1 text-amber-100">{newToken}</code></div>}
       <div className="mt-4 grid gap-2">
         {tokens.length === 0 && <div className="text-sm text-slate-500">No tokens yet.</div>}
         {tokens.map(t => (
           <div key={t.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white/70 p-3 text-sm">
             <div>
               <div className="font-medium">{t.name}</div>
               <div className="text-xs text-slate-500">prefix {t.prefix}… · created {new Date(t.createdAt).toLocaleString()} {t.lastUsedAt ? `· last used ${new Date(t.lastUsedAt).toLocaleString()}` : ""} {t.revokedAt ? "· revoked" : ""}</div>
             </div>
             {!t.revokedAt && <Button variant="ghost" onClick={() => revoke(t.id)}><Trash2 size={14} className="mr-1"/>Revoke</Button>}
           </div>
         ))}
       </div>
     </Card>

     <YouTubeCard/>

   </div>
 </div>;
}

function YouTubeCard(){
 const [status,setStatus] = useState<{configured:boolean;connected:boolean;channelTitle:string|null}|null>(null);
 const [clientId,setClientId] = useState("");
 const [clientSecret,setClientSecret] = useState("");
 const [busy,setBusy] = useState(false);
 const [notice,setNotice] = useState<string|null>(null);

 async function refresh(){
   const r = await fetch("/api/admin/youtube");
   if(r.ok) setStatus(await r.json());
 }
 useEffect(()=>{
   refresh();
   const q = new URLSearchParams(window.location.search).get("youtube");
   if(q === "connected") setNotice("YouTube channel connected. Reels now mirror to Shorts automatically.");
   else if(q) setNotice(`YouTube connection failed: ${q}`);
 },[]);

 async function saveClient(){
   setBusy(true);
   try{
     const r = await fetch("/api/admin/youtube", { method:"POST", headers:{"content-type":"application/json"}, body: JSON.stringify({ clientId, clientSecret }) });
     const d = await r.json();
     if(!r.ok){ alert(d.error); return; }
     setClientId(""); setClientSecret("");
     await refresh();
   } finally { setBusy(false); }
 }
 async function disconnect(){
   if(!confirm("Disconnect the YouTube channel? Scheduled reels will stop mirroring to Shorts.")) return;
   await fetch("/api/admin/youtube", { method:"DELETE" });
   refresh();
 }

 return <Card className="p-5">
   <div className="mb-1 font-medium">YouTube Shorts</div>
   <p className="mb-4 text-sm text-slate-600">Every published Reel is mirrored to the connected YouTube channel as a public Short. Stills and Stories stay on Instagram.</p>
   {notice && <div className="mb-3 rounded-xl border border-emerald-500/30 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}
   {status?.connected
     ? <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white/70 p-3 text-sm">
         <div>
           <div className="font-medium">Connected{status.channelTitle ? ` · ${status.channelTitle}` : ""}</div>
           <div className="text-xs text-slate-500">Uploads use the youtube.upload scope only.</div>
         </div>
         <Button variant="ghost" onClick={disconnect}>Disconnect</Button>
       </div>
     : <div className="grid gap-3">
         <div className="grid gap-3 md:grid-cols-2">
           <Input value={clientId} onChange={e=>setClientId(e.target.value)} placeholder="Google OAuth client ID"/>
           <Input value={clientSecret} onChange={e=>setClientSecret(e.target.value)} placeholder="Google OAuth client secret" type="password"/>
         </div>
         <div className="flex flex-wrap gap-3">
           <Button onClick={saveClient} disabled={busy || !clientId || !clientSecret}>Save OAuth client</Button>
           <Button variant="outline" disabled={!status?.configured} onClick={()=>{ window.location.href = "/api/admin/youtube/connect"; }}>Connect YouTube channel</Button>
         </div>
         <p className="text-xs text-slate-500">Google Cloud Console → APIs &amp; Services → Credentials → Create OAuth client ID (Web application) with redirect URI <code className="rounded bg-slate-100 px-1">{typeof window !== "undefined" ? `${window.location.origin}/api/oauth/youtube/callback` : "/api/oauth/youtube/callback"}</code>, and enable the YouTube Data API v3.</p>
       </div>}
 </Card>;
}

// Green light status indicator. Three states: green (key live), red (key live
// but the provider rejected it), amber (no key configured yet). When status
// is unknown we render a dimmed dot so the layout doesn't jump on first load.
function LiveDot({
  state,
  latency,
  status,
  error,
  compact
}: {
  state: "green" | "red" | "amber" | "unknown";
  latency: number | null;
  status: number | null;
  error: string | null;
  compact?: boolean;
}) {
  const color =
    state === "green" ? "#22c55e" :
    state === "red"   ? "#ef4444" :
    state === "amber" ? "#f59e0b" :
                        "#475569"; // unknown
  const label =
    state === "green" ? "live" :
    state === "red"   ? "rejected" :
    state === "amber" ? "no key" :
                        "checking…";
  const tip = error ? `${label} · ${error}` : (status ? `${label} · HTTP ${status}` : label) + (latency != null ? ` · ${latency}ms` : "");
  const size = compact ? 12 : 14;
  return (
    <span title={tip} className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-600">
      <span className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
        <span
          aria-hidden
          className={state === "green" ? "absolute inline-block h-full w-full rounded-full opacity-60" : ""}
          style={{
            backgroundColor: color,
            animation: state === "green" ? "liveDotPulse 2.4s ease-in-out infinite" : undefined
          }}
        />
        <span
          className="relative inline-block rounded-full"
          style={{ width: Math.max(8, size - 4), height: Math.max(8, size - 4), backgroundColor: color }}
        />
      </span>
      {!compact && <span>{label}</span>}
      <style>{`@keyframes liveDotPulse { 0%,100% { transform: scale(1); opacity: 0.55 } 50% { transform: scale(1.9); opacity: 0 } }`}</style>
    </span>
  );
}
