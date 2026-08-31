"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Megaphone, Sparkles, RefreshCcw, Check, AlertCircle, ImagePlus, X, ChevronRight, Wand2, Calendar, Upload, UserCircle2, FileText, Layers, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import presets from "@/data/campaign-presets.json";
import backgrounds from "@/data/backgrounds.json";
import tones from "@/data/tones.json";
import avatars from "@/data/avatar-presets.json";

type ContentFormat = "cinematic" | "ugc" | "newsroom" | "direct_to_camera" | "podcast_split_screen";
type OutputMix = "video" | "still" | "auto";
type CalendarDays = 3 | 7 | 14 | 30;
type VideoEngine = "veo" | "grok" | "a2e" | "hedra";
type SpokespersonMode = "canonical" | "ai_oneoff" | "operator_upload";

type Campaign = {
  id: string;
  name: string;
  category: string;
  website?: string | null;
  mission: string;
  tone?: string | null;
  platform?: string | null;
  avatarId?: string | null;
  backgroundId?: string | null;
  status: string;
  createdAt: string;
  // Extended fields (stored in site_context JSON in the DB)
  siteContext?: string | null;
};

type Ext = {
  contentFormat: ContentFormat;
  outputMix: OutputMix;
  calendarDays: CalendarDays;
  autoPost: boolean;
  videoEngine: VideoEngine;
  videoModel: string;
  duration: number;
  spokespersonMode: SpokespersonMode;
  oneOffReferenceName?: string | null;
  oneOffReferenceDataUrl?: string | null;
  targetAudience?: string;
  aiPlan?: { hook?: string; scenes?: string[]; dialogue?: string; postCopy?: string; hashtags?: string[]; cta?: string };
};

const ENGINE_META: Record<VideoEngine, { label: string; help: string; defaultModel: string; modelOptions: string[]; baseDuration: number; requiresKey: string }> = {
  veo: {
    label: "Google Veo 3.1",
    help: "8s cinematic direct response. Default for Cinematic, Newsroom, Direct-to-camera.",
    defaultModel: "veo-3.1-generate-preview",
    modelOptions: ["veo-3.1-generate-preview", "veo-3.1-fast-generate-preview", "veo-3.1-lite-generate-preview"],
    baseDuration: 8,
    requiresKey: "VEO_API_KEY"
  },
  grok: {
    label: "xAI Grok Imagine",
    help: "Up to 15s. Default for UGC / creator-style content.",
    defaultModel: "grok-imagine-video-1.5",
    modelOptions: ["grok-imagine-video-1.5", "grok-imagine-video-1.0"],
    baseDuration: 15,
    requiresKey: "XAI_API_KEY"
  },
  a2e: {
    label: "A2E AI multi-model",
    help: "Up to 30s. Routes to Veo / Wan / Kling / Seedance / Sora.",
    defaultModel: "veo3",
    modelOptions: ["veo3", "veo3_fast", "wan", "wan-3.0", "kling", "seedance", "sora"],
    baseDuration: 30,
    requiresKey: "A2E_API_KEY"
  },
  hedra: {
    label: "Hedra",
    help: "15/30s avatar with audio drive. Default for Podcast / split-screen.",
    defaultModel: "hedra-character-3",
    modelOptions: ["hedra-character-3", "hedra-character-2", "fal/grok-video-t2v", "fal/grok-video-i2v", "together/hedra-avatar"],
    baseDuration: 30,
    requiresKey: "HEDRA_API_KEY"
  }
};

const CONTENT_FORMAT_OPTIONS: { id: ContentFormat; label: string; sub: string; icon: any }[] = [
  { id: "cinematic", label: "Cinematic", sub: "Hero piece, full edit", icon: Layers },
  { id: "ugc", label: "UGC / creator", sub: "Authentic creator voice", icon: UserCircle2 },
  { id: "newsroom", label: "Newsroom", sub: "Anchor at desk, news monitors", icon: Megaphone },
  { id: "direct_to_camera", label: "Direct-to-camera", sub: "Spokesperson on a single shot", icon: Play },
  { id: "podcast_split_screen", label: "Podcast / split-screen", sub: "Host above + lower-third", icon: Layers }
];

const CALENDAR_DAYS: CalendarDays[] = [3, 7, 14, 30];

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(new Error("Could not read file"));
    r.readAsDataURL(file);
  });
}

export default function CampaignsPage() {
  const [name, setName] = useState("CaseClosedFL · Florida PI campaign");
  const [website, setWebsite] = useState("https://caseclosedfl.com");
  const [contentFormat, setContentFormat] = useState<ContentFormat>("cinematic");
  const [outputMix, setOutputMix] = useState<OutputMix>("video");
  const [calendarDays, setCalendarDays] = useState<CalendarDays>(7);
  const [autoPost, setAutoPost] = useState(false);

  const [category, setCategory] = useState(presets[0]?.id || "ugc");
  const [tone, setTone] = useState(tones[0] || "direct");
  const [videoEngine, setVideoEngine] = useState<VideoEngine>(
    contentFormat === "podcast_split_screen" ? "hedra" : "veo"
  );
  const [videoModel, setVideoModel] = useState<string>(ENGINE_META.veo.defaultModel);
  const [duration, setDuration] = useState<number>(8);

  const [avatarId, setAvatarId] = useState(avatars[0]?.id || "");
  const [backgroundId, setBackgroundId] = useState(backgrounds[0]?.id || "");
  const [spokespersonMode, setSpokespersonMode] = useState<SpokespersonMode>("canonical");
  const [oneOffRefName, setOneOffRefName] = useState<string | null>(null);
  const [oneOffRefDataUrl, setOneOffRefDataUrl] = useState<string | null>(null);

  const [mission, setMission] = useState("Create a direct-response PI campaign for rideshare passengers who were injured and need a case review.");
  const [aiPlan, setAiPlan] = useState<Ext["aiPlan"] | null>(null);
  const [planning, setPlanning] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createFillCalendar, setCreateFillCalendar] = useState(true);

  // Sync engine default when format changes
  useEffect(() => {
    const m = ENGINE_META[videoEngine];
    if (!m.modelOptions.includes(videoModel)) setVideoModel(m.defaultModel);
    if (contentFormat === "podcast_split_screen") {
      setVideoEngine("hedra");
      setDuration(30);
    } else if (contentFormat === "ugc") {
      setVideoEngine("grok");
      setDuration(15);
    } else {
      setVideoEngine("veo");
      setDuration(8);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentFormat]);

  useEffect(() => {
    setVideoModel(ENGINE_META[videoEngine].defaultModel);
    if (videoEngine === "veo") setDuration(8);
    if (videoEngine === "grok") setDuration(15);
    if (videoEngine === "hedra") setDuration(30);
    if (videoEngine === "a2e") setDuration(15);
  }, [videoEngine]);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/campaigns", { cache: "no-store" });
      if (!r.ok) return;
      const d = await r.json();
      setCampaigns(d.campaigns || []);
    } catch {}
  }, []);
  useEffect(() => { load(); }, [load]);

  async function runAiPlan() {
    setPlanning(true); setError(null); setAiPlan(null);
    try {
      const r = await fetch("/api/internal/ugc/write", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mission: `${mission}\nFormat: ${contentFormat}. Output mix: ${outputMix}. Calendar: ${calendarDays} days. Target: PI lead-gen for ${category.replace(/_/g, " ")}.`,
          tone,
          contextMode: "mixed",
          targetSeconds: duration
        })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setAiPlan({
        hook: d.hook || "",
        scenes: Array.isArray(d.scenes) ? d.scenes : (d.script ? d.script.split(/\n+/).slice(0, 4) : []),
        dialogue: d.script || "",
        postCopy: d.postCaption || "",
        hashtags: Array.isArray(d.captions) ? d.captions : [],
        cta: d.cta || "Book a free case review today."
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPlanning(false);
    }
  }

  async function saveCampaign(opts: { fillCalendar: boolean }) {
    setBusy(true); setError(null); setSaved(null);
    try {
      const ext: Ext = {
        contentFormat, outputMix, calendarDays, autoPost,
        videoEngine, videoModel, duration,
        spokespersonMode,
        oneOffReferenceName: oneOffRefName,
        oneOffReferenceDataUrl: oneOffRefDataUrl,
        targetAudience: category.replace(/_/g, " "),
        aiPlan: aiPlan || undefined
      };
      const r = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name, website, category,
          mission: aiPlan?.dialogue ? `${mission}\n\n---\nAI plan:\n${aiPlan.hook ? `Hook: ${aiPlan.hook}\n` : ""}${aiPlan.dialogue}` : mission,
          tone, platform: "instagram",
          avatarId, backgroundId,
          siteContext: JSON.stringify(ext)
        })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      const campaignId = d.campaign.id;

      if (opts.fillCalendar) {
        const res = await fetch("/api/calendar/fill", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ campaignId, days: calendarDays, autoPost, outputMix })
        });
        if (!res.ok) {
          const e2 = await res.json().catch(() => ({}));
          throw new Error(`Calendar fill failed: ${e2.error || res.status}`);
        }
      }
      setSaved(campaignId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthGuard>
      <AppShell>
        <main className="mx-auto max-w-7xl px-4 py-8">
          {/* Hero header */}
          <div className="mb-6 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-sm font-medium text-violet-700">
              <Megaphone size={16} /> Campaign production
            </div>
            <h1 className="text-[34px] font-semibold leading-tight tracking-tight text-slate-900">Create</h1>
            <p className="max-w-3xl text-[15px] text-slate-600">
              One campaign workspace: choose the scenario, output, provider/model, spokesperson and schedule. AI writes the creative brief. Podcast / split-screen continues into a two-lane production step without losing these settings.
            </p>
          </div>

          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              <AlertCircle size={15} /> {error}
            </div>
          )}
          {saved && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
              <Check size={15} /> Campaign saved{saved ? ` (${saved.slice(0, 8)}…)` : ""}. Calendar items created.
            </div>
          )}

          <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
            {/* Main builder */}
            <section className="soro-card p-5">
              {/* Identity */}
              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Campaign name</span>
                  <input value={name} onChange={e => setName(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm" />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Website / landing page</span>
                  <input value={website} onChange={e => setWebsite(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="https://caseclosedfl.com" />
                </label>
              </div>

              {/* Content format */}
              <div className="mt-5">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Content format</div>
                <div className="grid gap-2 md:grid-cols-5">
                  {CONTENT_FORMAT_OPTIONS.map(o => {
                    const Icon = o.icon;
                    const on = contentFormat === o.id;
                    return (
                      <button
                        key={o.id}
                        onClick={() => setContentFormat(o.id)}
                        className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition ${on ? "border-violet-400 bg-violet-50 ring-1 ring-violet-200" : "border-slate-200 bg-white hover:border-slate-300"}`}
                      >
                        <Icon size={16} className={on ? "text-violet-600" : "text-slate-500"} />
                        <div className="text-[13px] font-semibold text-slate-900">{o.label}</div>
                        <div className="text-[11px] text-slate-500">{o.sub}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Output mix */}
              <div className="mt-5">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Output mix</div>
                <div className="grid gap-2 md:grid-cols-3">
                  {([
                    { id: "video" as const, label: "Video", sub: "Generate video posts with the selected engine." },
                    { id: "still" as const, label: "Still image", sub: "Generate a campaign still; canonical identity is preserved when supported." },
                    { id: "auto" as const, label: "Auto mix", sub: "Alternates Video → Still → Video → Still in Calendar and Generate now." }
                  ]).map(o => {
                    const on = outputMix === o.id;
                    return (
                      <button
                        key={o.id}
                        onClick={() => setOutputMix(o.id)}
                        className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition ${on ? "border-violet-400 bg-violet-50 ring-1 ring-violet-200" : "border-slate-200 bg-white hover:border-slate-300"}`}
                      >
                        <div className="text-[13px] font-semibold text-slate-900">{o.label}</div>
                        <div className="text-[11px] text-slate-500">{o.sub}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Calendar fill */}
              <div className="mt-5">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Fill Calendar for</div>
                <div className="flex flex-wrap items-center gap-2">
                  {CALENDAR_DAYS.map(d => (
                    <button
                      key={d}
                      onClick={() => setCalendarDays(d)}
                      className={`h-10 rounded-xl border px-4 text-sm font-medium transition ${calendarDays === d ? "border-violet-400 bg-violet-50 text-violet-700" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"}`}
                    >
                      {d} days
                    </button>
                  ))}
                </div>
                <label className="mt-3 flex items-start gap-2 text-[12px] text-slate-600">
                  <input type="checkbox" checked={autoPost} onChange={e => setAutoPost(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300" />
                  <span>
                    <strong className="text-slate-900">Auto-post approved content when due.</strong> Off keeps every Calendar item in owner review/manual-post mode.
                  </span>
                </label>
              </div>

              {/* Campaign type */}
              <div className="mt-5">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Campaign type · AI creative brief</div>
                <div className="grid gap-2 md:grid-cols-2">
                  {presets.map(p => {
                    const on = category === p.id;
                    return (
                      <button
                        key={p.id}
                        onClick={() => setCategory(p.id)}
                        className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition ${on ? "border-violet-400 bg-violet-50 ring-1 ring-violet-200" : "border-slate-200 bg-white hover:border-slate-300"}`}
                      >
                        <div className="text-[13px] font-semibold text-slate-900">{p.label}</div>
                        <div className="text-[11px] text-slate-500">{p.promptFocus}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Video engine + model */}
              <div className="mt-5">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Video engine</div>
                <div className="grid gap-2 md:grid-cols-2">
                  {(["veo", "grok", "a2e", "hedra"] as VideoEngine[]).map(e => {
                    const m = ENGINE_META[e];
                    const on = videoEngine === e;
                    return (
                      <button
                        key={e}
                        onClick={() => setVideoEngine(e)}
                        className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition ${on ? "border-violet-400 bg-violet-50 ring-1 ring-violet-200" : "border-slate-200 bg-white hover:border-slate-300"}`}
                      >
                        <div className="flex w-full items-center justify-between">
                          <div className="text-[13px] font-semibold text-slate-900">{m.label}</div>
                          <span className="text-[10px] uppercase tracking-wide text-slate-500">needs {m.requiresKey}</span>
                        </div>
                        <div className="text-[11px] text-slate-500">{m.help}</div>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-[1fr_120px]">
                  <label className="space-y-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Video model</span>
                    <select value={videoModel} onChange={e => setVideoModel(e.target.value)} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm">
                      {ENGINE_META[videoEngine].modelOptions.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Duration</span>
                    <select value={duration} onChange={e => setDuration(Number(e.target.value))} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm">
                      {ENGINE_META[videoEngine].baseDuration === 8 ? (
                        <option value={8}>8 seconds</option>
                      ) : ENGINE_META[videoEngine].baseDuration === 15 ? (
                        [10, 15].map(s => <option key={s} value={s}>{s} seconds</option>)
                      ) : (
                        [15, 30].map(s => <option key={s} value={s}>{s} seconds</option>)
                      )}
                    </select>
                  </label>
                </div>
              </div>

              {/* AI brief */}
              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">AI campaign plan</div>
                  <Button onClick={runAiPlan} disabled={planning} className="bg-violet-600 text-white hover:bg-violet-700">
                    {planning ? <><RefreshCcw size={14} className="mr-2 animate-spin" />Planning…</> : <><Wand2 size={14} className="mr-2" />Plan with NVIDIA</>}
                  </Button>
                </div>
                <p className="mb-3 text-[12px] text-slate-500">
                  The selected campaign and output type are the brief. NVIDIA writes the hook, scene/frame direction, dialogue and post copy.
                </p>
                {!aiPlan ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
                    {planning ? "Planning campaign…" : "Run the planner to see the hook, scenes, dialogue, and post copy here."}
                  </div>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {aiPlan.hook && (
                      <div className="soro-card p-3">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-violet-700">Hook</div>
                        <div className="mt-1 text-sm font-semibold text-slate-900">{aiPlan.hook}</div>
                      </div>
                    )}
                    {aiPlan.cta && (
                      <div className="soro-card p-3">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-violet-700">CTA</div>
                        <div className="mt-1 text-sm text-slate-900">{aiPlan.cta}</div>
                      </div>
                    )}
                    {aiPlan.scenes && aiPlan.scenes.length > 0 && (
                      <div className="soro-card p-3 md:col-span-2">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-violet-700">Scene direction</div>
                        <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-slate-900">
                          {aiPlan.scenes.map((s, i) => <li key={i}>{s}</li>)}
                        </ol>
                      </div>
                    )}
                    {aiPlan.dialogue && (
                      <div className="soro-card p-3 md:col-span-2">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-violet-700">Dialogue</div>
                        <div className="mt-1 whitespace-pre-wrap text-sm text-slate-900">{aiPlan.dialogue}</div>
                      </div>
                    )}
                    {aiPlan.postCopy && (
                      <div className="soro-card p-3 md:col-span-2">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-violet-700">Post copy</div>
                        <div className="mt-1 whitespace-pre-wrap text-sm text-slate-900">{aiPlan.postCopy}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Optional overrides */}
              <div className="mt-5">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Optional operator overrides</div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <div className="text-[12px] font-semibold text-slate-700">Spokesperson / reference</div>
                    <div className="grid gap-1">
                      {([
                        { id: "canonical" as const, label: "Choose canonical avatar" },
                        { id: "ai_oneoff" as const, label: "AI chooses / use one-off reference" },
                        { id: "operator_upload" as const, label: "Operator uploads reference" }
                      ]).map(o => {
                        const on = spokespersonMode === o.id;
                        return (
                          <label key={o.id} className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-[13px] transition ${on ? "border-violet-400 bg-violet-50" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                            <input type="radio" name="spokesperson" value={o.id} checked={on} onChange={() => setSpokespersonMode(o.id)} className="h-4 w-4" />
                            <span className="text-slate-900">{o.label}</span>
                          </label>
                        );
                      })}
                    </div>
                    {spokespersonMode === "canonical" && (
                      <select value={avatarId} onChange={e => setAvatarId(e.target.value)} className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm">
                        {avatars.map(a => <option key={a.id} value={a.id}>{a.name} · {a.referenceImage ? "reference ready" : "no reference"}</option>)}
                      </select>
                    )}
                  </div>
                  <div className="space-y-2">
                    <div className="text-[12px] font-semibold text-slate-700">Reference image (optional)</div>
                    {oneOffRefDataUrl ? (
                      <div className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={oneOffRefDataUrl} alt="one-off reference" className="aspect-[3/4] w-full rounded-xl border border-slate-200 object-cover" />
                        <button
                          onClick={() => { setOneOffRefDataUrl(null); setOneOffRefName(null); }}
                          className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-white/90 text-slate-700 shadow"
                          aria-label="Remove reference"
                        >
                          <X size={14} />
                        </button>
                        {oneOffRefName && <div className="mt-1 truncate text-[11px] text-slate-500">{oneOffRefName}</div>}
                      </div>
                    ) : (
                      <label className="grid h-32 cursor-pointer place-items-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-center text-[12px] text-slate-500 hover:bg-slate-100">
                        <div>
                          <Upload size={16} className="mx-auto mb-1 text-slate-400" />
                          <div>Click to upload one-off reference</div>
                          <div className="mt-0.5 text-[10px] text-slate-400">PNG, JPG, WebP</div>
                        </div>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="hidden"
                          onChange={async e => {
                            const f = e.target.files?.[0];
                            if (!f) return;
                            setOneOffRefName(f.name);
                            setOneOffRefDataUrl(await fileToDataUrl(f));
                            e.target.value = "";
                          }}
                        />
                      </label>
                    )}
                    <p className="text-[11px] text-slate-500">or upload one-off reference for video</p>
                  </div>
                </div>
              </div>

              {/* Mission */}
              <div className="mt-5">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Mission</div>
                <textarea value={mission} onChange={e => setMission(e.target.value)} className="min-h-28 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm" />
              </div>

              {/* Save + Fill calendar */}
              <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
                <div className="text-[11px] text-slate-500">
                  Estimated engine: <strong className="text-slate-900">{ENGINE_META[videoEngine].label}</strong> · {duration}s · {calendarDays}-day calendar · {autoPost ? "auto-post" : "manual review"}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" onClick={() => saveCampaign({ fillCalendar: false })} disabled={busy || !name.trim() || !mission.trim()}>
                    Save campaign
                  </Button>
                  <Button onClick={() => saveCampaign({ fillCalendar: true })} disabled={busy || !name.trim() || !mission.trim()} className="bg-violet-600 text-white hover:bg-violet-700">
                    {busy ? <><RefreshCcw size={14} className="mr-2 animate-spin" />Saving…</> : <>Save + fill Calendar</>}
                  </Button>
                </div>
              </div>
            </section>

            {/* Right rail: Saved campaigns */}
            <aside className="grid content-start gap-4">
              <section className="soro-card p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <FileText size={14} className="text-violet-600" /> Saved campaigns
                </div>
                <p className="mb-3 text-[11px] text-slate-500">
                  Create is the single campaign builder. Campaigns is saved-plan history.
                </p>
                <div className="grid gap-2 max-h-[640px] overflow-y-auto">
                  {campaigns.map(c => {
                    let ext: Ext | null = null;
                    if (c.siteContext) { try { ext = JSON.parse(c.siteContext); } catch {} }
                    return (
                      <a
                        key={c.id}
                        href={`/calendar?campaign=${c.id}`}
                        className="rounded-xl border border-slate-200 bg-white p-3 hover:border-violet-300 hover:bg-violet-50/30"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[13px] font-semibold text-slate-900 truncate">{c.name}</div>
                          <ChevronRight size={12} className="text-slate-400" />
                        </div>
                        <div className="mt-1 text-[10px] uppercase tracking-wider text-slate-500">
                          {c.category} · {c.status}
                          {ext ? ` · ${ext.videoEngine} · ${ext.duration}s` : ""}
                        </div>
                        <div className="mt-1 line-clamp-2 text-[11px] text-slate-600">{c.mission}</div>
                        <div className="mt-1 text-[10px] text-slate-400">{new Date(c.createdAt).toLocaleString()}</div>
                      </a>
                    );
                  })}
                  {!campaigns.length && (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-[12px] text-slate-500">
                      No saved campaigns yet.
                    </div>
                  )}
                </div>
              </section>
              <section className="soro-card p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Calendar size={14} className="text-violet-600" /> Calendar
                </div>
                <p className="text-[12px] text-slate-600">Save + fill Calendar creates draft posts in /calendar for the selected number of days, alternating Video/Still according to the Output mix.</p>
                <a href="/calendar" className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-violet-700 hover:text-violet-800">
                  Open Calendar <ChevronRight size={12} />
                </a>
              </section>
            </aside>
          </div>
        </main>
      </AppShell>
    </AuthGuard>
  );
}
