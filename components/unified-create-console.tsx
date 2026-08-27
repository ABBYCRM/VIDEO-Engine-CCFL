"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  RefreshCcw,
  Send,
  Calendar as CalendarIcon,
  ImageIcon,
  Film,
  Users,
  Mic2,
  Check,
  AlertCircle,
  Eye,
  Library,
  X,
  Loader2
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { visualTemplates, type VisualTemplateId } from "@/lib/visual-templates";
import { PageHeader } from "@/components/ui/page-header";

type Tab = "car_accident" | "rideshare" | "trucking" | "slip_fall" | "ugc";
const TABS: { id: Tab; label: string; emoji: string; description: string }[] = [
  { id: "car_accident", label: "Vehicle", emoji: "🚗", description: "Realistic car accident aftermath" },
  { id: "rideshare",   label: "Rideshare", emoji: "🚖", description: "Uber / Lyft passenger injury" },
  { id: "trucking",    label: "Trucking", emoji: "🚛", description: "18-wheeler / commercial truck" },
  { id: "slip_fall",   label: "Slip & Fall", emoji: "⚠️", description: "Premises hazard liability" },
  { id: "ugc",         label: "UGC", emoji: "🎬", description: "Creator-style authentic ad" }
];

type Avatar = { id: string; name: string; gender: "male" | "female" | "non-binary"; archetype: string; hasReference: boolean };

const IMAGE_MODELS: Record<string, Array<{ id: string; label: string }>> = {
  hedra: [
    { id: "gpt-image-2", label: "Hedra · gpt-image-2" },
    { id: "flux2-max", label: "Hedra · FLUX.2 [max]" },
    { id: "flux-kontext", label: "Hedra · flux-kontext" },
    { id: "nano-banana-pro", label: "Hedra · nano-banana-pro" },
    { id: "imagen-4", label: "Hedra · imagen-4" },
    { id: "seedream-5", label: "Hedra · seedream-5" },
    { id: "ideogram-v4", label: "Hedra · ideogram-v4" },
    { id: "recraft-v3", label: "Hedra · recraft-v3" },
  ],
  gemini: [
    { id: "gemini-2.5-flash-image", label: "Gemini 2.5 Flash Image" },
    { id: "gemini-3.1-flash-image-preview", label: "Gemini 3.1 Flash Image preview" },
  ],
  openai: [
    { id: "gpt-image-1", label: "OpenAI · gpt-image-1" },
    { id: "dall-e-3", label: "OpenAI · DALL·E 3" },
  ],
  xai: [
    { id: "grok-imagine-image", label: "xAI · Grok Imagine Image" },
  ],
  a2e: [
    { id: "gpt-image-1.5", label: "A2E · gpt-image-1.5" },
    { id: "gpt-image-2", label: "A2E · gpt-image-2" },
  ],
};

export function UnifiedCreateConsole() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("car_accident");
  const [prompt, setPrompt] = useState("");
  const [avatarId, setAvatarId] = useState<string | null>(null);
  const [avatarGender, setAvatarGender] = useState<"male" | "female">("female");
  const [horizonDays, setHorizonDays] = useState(7);
  const [outputMode, setOutputMode] = useState<"image" | "video" | "auto_mix">("auto_mix");
  const [approvalMode, setApprovalMode] = useState<"auto" | "manual">("auto");
  const [model, setModel] = useState("fal/grok-video-i2v");
  const [provider, setProvider] = useState("hedra");
  const [duration, setDuration] = useState(15); // Hedra 8-30s; A2E Seedance 15-30s; Grok/Veo 8s
  const [imageProvider, setImageProvider] = useState("hedra");
  const [imageModel, setImageModel] = useState("gpt-image-2");
  const [language, setLanguage] = useState("mix"); // en | es | mix
  const [templateId, setTemplateId] = useState<VisualTemplateId>("auto");

  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [promptSuggestions, setPromptSuggestions] = useState<string[]>([]);
  const [pollJobId, setPollJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/unified/create", { cache: "no-store" })
      .then(r => r.json())
      .then(d => {
        if (!alive) return;
        setAvatars(d.avatars || []);
        setPromptSuggestions((d.prompts?.[tab]?.focus || "").split(/[,;.]/).map((s:string)=>s.trim()).filter(Boolean));
        if (d.defaultImageProvider) setImageProvider(d.defaultImageProvider);
        if (d.defaultImageModel) setImageModel(d.defaultImageModel);
      })
      .catch(e => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [tab]);

  // Poll video job status
  useEffect(() => {
    if (!pollJobId) return;
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch(`/api/v1/video/${pollJobId}`, { cache: "no-store" });
        const j = await r.json();
        if (alive) setJobStatus(j.status);
        if (alive && (j.status === "succeeded" || j.status === "failed")) return;
      } catch (e) {}
      if (alive) setTimeout(tick, 4000);
    };
    tick();
    return () => { alive = false; };
  }, [pollJobId]);

  const grouped = useMemo(() => {
    return {
      female: avatars.filter(a => a.gender === "female"),
      male: avatars.filter(a => a.gender === "male")
    };
  }, [avatars]);

  async function submit() {
    setError(null);
    setResult(null);
    setBusy(true);
    setPollJobId(null);
    setJobStatus(null);
    try {
      const r = await fetch("/api/unified/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tab, prompt, avatarId, avatarGender, horizonDays, outputMode, approvalMode, model, provider, durationSeconds: duration, language, templateId, imageProvider, imageModel })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setResult(d);
      if (d.videoJobId) {
        setPollJobId(d.videoJobId);
        setJobStatus(d.videoStatus || "queued");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function runCategoryAutomation() {
    setError(null); setResult(null); setBusy(true); setPollJobId(null); setJobStatus(null);
    try {
      const r = await fetch("/api/unified/create", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tab, prompt, avatarId, avatarGender, horizonDays, approvalMode, model, provider, language, templateId, imageProvider, imageModel, automationMode: "category-run" }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`); setResult(d);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  return (
    <AuthGuard>
      <AppShell>
        <main className="max-w-6xl">
          {/* Header */}
          <PageHeader
            eyebrow="Unified campaign builder"
            eyebrowIcon={<Sparkles size={16} />}
            title="Create"
            description="One screen for every campaign. Pick a scenario, write or generate the brief, choose the spokesperson, and let Hedra render the video (Character 3 or Grok Video). Every job lands in the Library and is auto-scheduled to the Calendar (1 reel + 1 stories daily)."
            actions={<>
              <Button variant="secondary" onClick={() => router.push("/library")}><Library size={14} className="mr-2" />Library</Button>
              <Button variant="secondary" onClick={() => router.push("/calendar")}><CalendarIcon size={14} className="mr-2" />Calendar</Button>
            </>}
          />

          {/* Scenario tabs */}
          <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {TABS.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "rounded-2xl border p-4 text-left transition",
                  tab === t.id
                    ? "border-violet-400 bg-violet-50 ring-2 ring-violet-200"
                    : "border-slate-200 bg-white hover:border-violet-200"
                )}
                data-active={tab === t.id}
              >
                <div className="text-2xl">{t.emoji}</div>
                <div className="mt-2 text-sm font-semibold text-slate-900">{t.label}</div>
                <div className="mt-0.5 text-[11px] leading-snug text-slate-500">{t.description}</div>
              </button>
            ))}
          </div>

          {/* Prompt + Options */}
          <div className="rounded-2xl border bg-white p-5">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="md:col-span-2">
                <label className="grid gap-2 text-sm">
                  <span className="font-medium text-slate-700">Creative brief</span>
                  <Textarea
                    value={prompt}
                    onChange={e => setPrompt(e.target.value)}
                    rows={4}
                    placeholder={`Describe the scene you want. Hedra uses the hero still as the start frame; wardrobe, gender, and hyper-realism cues are appended automatically.`}
                  />
                </label>
                {promptSuggestions.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {promptSuggestions.slice(0, 6).map((s, i) => (
                      <button key={i} type="button" onClick={() => setPrompt(p => p ? `${p}; ${s}` : s)} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-600 hover:bg-slate-100">+ {s}</button>
                    ))}
                  </div>
                )}
              </div>
              <div className="grid gap-3">
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium text-slate-700">Video provider</span>
                  <select value={provider} onChange={e => { const next = e.target.value; setProvider(next); if (next === "hedra") { setModel("fal/grok-video-i2v"); setDuration(15); } else if (next === "grok") { setModel("grok-imagine-video-1.5"); setDuration(8); } else if (next === "veo") { setModel("veo-3.1-generate-preview"); setDuration(8); } else { setModel("sora2"); setDuration(15); } }} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm">
                    <option value="hedra">Hedra (Character 3 / Grok Video)</option>
                    <option value="a2e">A2E (Sora 2 / Veo 3 / Kling)</option>
                    <option value="grok">xAI · Grok Imagine Video</option>
                    <option value="veo">Google · Veo 3.1 (Gemini)</option>
                  </select>
                </label>
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium text-slate-700">Video model</span>
                  <select value={model} onChange={e => setModel(e.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm">
                    {provider === "hedra" && (<>
                      <option value="fal/grok-video-i2v">Hedra · Grok Video I2V (uses hero still)</option>
                      <option value="fal/grok-video-t2v">Hedra · Grok Video T2V</option>
                      <option value="hedra-character-3">Hedra · Character 3 (needs audio)</option>
                      <option value="hedra-character-2">Hedra · Character 2 (needs audio)</option>
                      <option value="together/hedra-avatar">Hedra · Avatar (needs audio)</option>
                    </>)}
                    {provider === "a2e" && (<>
                      <option value="sora2">A2E · Sora 2 Pro (hyper-real, 8s)</option>
                      <option value="veo3">A2E · Veo 3 (8s, native audio)</option>
                      <option value="kling3">A2E · Kling 3.0</option>
                      <option value="kling3-fast">A2E · Kling 3.0 Fast</option>
                      <option value="seedance2.5">A2E · Seedance 2.5</option>
                      <option value="wan2.6-i2v">A2E · Wan 2.6 I2V</option>
                      <option value="happyhorse">A2E · HappyHorse</option>
                      <option value="veo3_fast">A2E · Veo 3 Fast</option>
                    </>)}
                    {provider === "grok" && (
                      <option value="grok-imagine-video-1.5">xAI · Grok Imagine Video 1.5 (8s)</option>
                    )}
                    {provider === "veo" && (<>
                      <option value="veo-3.1-generate-preview">Google · Veo 3.1 (preview, 8s)</option>
                      <option value="veo-3.1-fast-generate-preview">Google · Veo 3.1 Fast (preview, 8s)</option>
                      <option value="veo-3.1-lite-generate-preview">Google · Veo 3.1 Lite (preview, 8s)</option>
                    </>)}
                  </select>
                  {provider === "hedra" && (model === "hedra-character-3" || model === "hedra-character-2" || model === "together/hedra-avatar") && (
                    <p className="text-[11px] leading-snug text-amber-700">Character / Avatar models need driving audio plus a start image. For still-to-video campaigns, pick Grok Video I2V.</p>
                  )}
                </label>
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium text-slate-700">Video duration (seconds)</span>
                  <select value={duration} onChange={e => setDuration(Number(e.target.value))} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm">
                    {(provider === "grok" || provider === "veo") ? (
                      <option value={8}>8 seconds (8s cap)</option>
                    ) : provider === "hedra" ? (
                      <>
                        <option value={8}>8 seconds</option>
                        <option value={10}>10 seconds</option>
                        <option value={15}>15 seconds</option>
                        <option value={30}>30 seconds (Character default)</option>
                      </>
                    ) : (
                      <>
                        <option value={8}>8 seconds</option>
                        <option value={15}>15 seconds (Seedance default)</option>
                        <option value={20}>20 seconds (Seedance)</option>
                        <option value={25}>25 seconds (Seedance)</option>
                        <option value={30}>30 seconds (Seedance)</option>
                      </>
                    )}
                  </select>
                </label>
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium text-slate-700">Image provider</span>
                  <select value={imageProvider} onChange={e => {
                    const next = e.target.value;
                    setImageProvider(next);
                    setImageModel((IMAGE_MODELS[next] || IMAGE_MODELS.hedra)[0].id);
                  }} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm">
                    <option value="hedra">Hedra (gpt-image-2 / FLUX / Imagen / Seedream)</option>
                    <option value="gemini">Google Gemini image</option>
                    <option value="a2e">A2E GPT Image</option>
                    <option value="openai">OpenAI image</option>
                    <option value="xai">xAI Grok Imagine image</option>
                  </select>
                </label>
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium text-slate-700">Image model</span>
                  <select value={imageModel} onChange={e => setImageModel(e.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm">
                    {(IMAGE_MODELS[imageProvider] || IMAGE_MODELS.hedra).map(m => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium text-slate-700">Planning horizon (days)</span>
                  <select value={horizonDays} onChange={e => setHorizonDays(Number(e.target.value))} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm">
                    <option value={3}>3 days</option>
                    <option value={7}>7 days</option>
                    <option value={14}>14 days</option>
                    <option value={30}>30 days</option>
                    <option value={60}>60 days</option>
                  </select>
                </label>
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium text-slate-700">Language</span>
                  <select value={language} onChange={e => setLanguage(e.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm">
                    <option value="mix">EN + ES mix (bilingual)</option>
                    <option value="en">English only</option>
                    <option value="es">Spanish only (Español)</option>
                  </select>
                </label>

                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium text-slate-700">Output mix</span>
                  <select value={outputMode} onChange={e => setOutputMode(e.target.value as any)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm">
                    <option value="auto_mix">Auto-mix (reel + story)</option>
                    <option value="video">Reel only</option>
                    <option value="image">Stories only</option>
                  </select>
                </label>
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium text-slate-700">Auto-post (each ready video publishes as 1 Reel + 1 Story)</span>
                  <select value={approvalMode} onChange={e => setApprovalMode(e.target.value as any)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm">
                    <option value="auto">Auto (publish on schedule)</option>
                    <option value="manual">Manual approval</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-violet-100 bg-violet-50/40 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-slate-900">Visual template</div>
                  <p className="mt-0.5 text-xs text-slate-500">Choose a branded setting, or let AI pick the best fit for this brief.</p>
                </div>
                <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-violet-700">{templateId === "auto" ? "AI picks for you" : "Fixed selection"}</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {visualTemplates.map(template => {
                  const selected = templateId === template.id;
                  return (
                    <button key={template.id} type="button" onClick={() => setTemplateId(template.id)} className={cn("overflow-hidden rounded-xl border bg-white text-left transition", selected ? "border-violet-500 ring-2 ring-violet-200" : "border-slate-200 hover:border-violet-300")}>
                      <div className="relative h-24 overflow-hidden bg-slate-900">
                        {template.image ? <img src={template.image} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center gap-2 bg-gradient-to-br from-violet-700 via-indigo-700 to-slate-900 text-white"><Sparkles size={24} /><span className="text-xs font-semibold">AI SELECT</span></div>}
                        {selected && <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-violet-600 text-white"><Check size={14} /></span>}
                      </div>
                      <div className="p-3">
                        <div className="text-sm font-semibold text-slate-900">{template.label}</div>
                        <div className="mt-1 text-[11px] leading-snug text-slate-500">{template.description}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
              {templateId === "auto" && <p className="mt-3 text-xs text-violet-700">Auto uses the campaign category, avatar, and creative brief to choose the most suitable visual environment.</p>}
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button size="lg" onClick={submit} disabled={busy}>
                {busy ? <><Loader2 size={16} className="mr-2 animate-spin" />Generating…</> : <><Sparkles size={16} className="mr-2" />Generate + schedule</>}
              </Button>
              <Button size="lg" variant="secondary" onClick={runCategoryAutomation} disabled={busy}>
                <Sparkles size={16} className="mr-2" />Run 4-category IG autopilot
              </Button>
              {pollJobId && (
                <div className="rounded-xl border bg-slate-50 px-3 py-2 text-xs text-slate-700">
                  Video job <code className="font-mono">{pollJobId.slice(0,8)}</code>: <b>{jobStatus || "queued"}</b>
                </div>
              )}
            </div>

            {error && <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"><AlertCircle size={14} className="mr-1 inline" />{error}</div>}
            {result && (
              <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                <Check size={14} className="mr-1 inline" />
                {result.automation ? <><b>Automation queued.</b> {result.slots?.length || 4} core-category posts are now on the Calendar. Each ready video will publish as one Reel and one Story.</> : <><b>Created.</b> Hero image saved. Video job <code className="font-mono">{result.videoJobId?.slice(0,8)}</code> queued ({duration}s, {provider}). {result.scheduledPosts?.length || 0} additional slots scheduled.</>}
                {result.imageAsset?.savedAsset?.assetUrl && (
                  <div className="mt-2"><a className="underline" href={result.imageAsset.savedAsset.assetUrl} target="_blank" rel="noreferrer">View hero image →</a></div>
                )}
                <div className="mt-2 flex gap-2">
                  <Link href="/library"><Button variant="secondary" size="sm"><Library size={13} className="mr-2" />Open Library</Button></Link>
                  <Link href="/calendar"><Button variant="secondary" size="sm"><CalendarIcon size={13} className="mr-2" />Open Calendar</Button></Link>
                </div>
              </div>
            )}
          </div>

          {/* Avatar picker (bottom) */}
          <div className="mt-6 rounded-2xl border bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Users size={16} className="text-violet-600" /> Spokesperson
                </div>
                <p className="mt-0.5 text-xs text-slate-500">Pick the avatar that will appear in the generated video. The wardrobe rule is enforced for the female spokesperson.</p>
              </div>
              <Link href="/avatars" className="text-xs font-medium text-violet-700 hover:underline">Manage avatars →</Link>
            </div>

            <div className="mb-3 inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 text-xs">
              <button type="button" onClick={() => { setAvatarGender("female"); setAvatarId(null); }} className={cn("rounded-lg px-3 py-1.5 font-semibold", avatarGender === "female" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500")}>Female</button>
              <button type="button" onClick={() => { setAvatarGender("male"); setAvatarId(null); }} className={cn("rounded-lg px-3 py-1.5 font-semibold", avatarGender === "male" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500")}>Male</button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              <button
                type="button"
                onClick={() => setAvatarId(null)}
                className={cn("rounded-xl border p-3 text-left text-sm", avatarId === null ? "border-violet-400 bg-violet-50 ring-2 ring-violet-200" : "border-slate-200 bg-white hover:border-violet-200")}
              >
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Auto pick</div>
                <div className="mt-1 font-medium text-slate-900">Let AI choose a ready avatar</div>
                <div className="mt-1 text-[11px] text-slate-500">The campaign automation chooses a non-archived avatar with a reference first.</div>
              </button>
              {grouped[avatarGender].map(a => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setAvatarId(a.id)}
                  className={cn("rounded-xl border p-3 text-left text-sm", avatarId === a.id ? "border-violet-400 bg-violet-50 ring-2 ring-violet-200" : "border-slate-200 bg-white hover:border-violet-200")}
                >
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{a.archetype}</div>
                  <div className="mt-1 font-medium text-slate-900">{a.name}</div>
                  <div className="mt-1 text-[11px] text-slate-500">{a.hasReference ? "Reference ready" : "No reference yet"}</div>
                </button>
              ))}
              {grouped[avatarGender].length === 0 && (
                <div className="col-span-full rounded-xl border border-dashed bg-slate-50 p-4 text-center text-sm text-slate-500">
                  No {avatarGender} avatars yet. <Link href="/avatars" className="font-medium text-violet-700 underline">Create one →</Link>
                </div>
              )}
            </div>
          </div>

          {/* Footer info */}
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border bg-white p-4 text-xs text-slate-600">
              <div className="mb-1 flex items-center gap-1.5 font-semibold text-slate-900"><Film size={13} className="text-violet-600" />Hedra video</div>
              Hedra is the default renderer. Hero still is generated first (Hedra image models), then used as the video start frame.
            </div>
            <div className="rounded-2xl border bg-white p-4 text-xs text-slate-600">
              <div className="mb-1 flex items-center gap-1.5 font-semibold text-slate-900"><ImageIcon size={13} className="text-violet-600" />Hedra image</div>
              Hero still uses the selected Hedra image model (or Gemini / A2E / OpenAI). The still becomes the video start frame.
            </div>
            <div className="rounded-2xl border bg-white p-4 text-xs text-slate-600">
              <div className="mb-1 flex items-center gap-1.5 font-semibold text-slate-900"><CalendarIcon size={13} className="text-violet-600" />Calendar</div>
              1 reel + 1 stories scheduled daily across the chosen horizon. Auto-publish kicks in if Auto is on.
            </div>
          </div>
        </main>
      </AppShell>
    </AuthGuard>
  );
}
