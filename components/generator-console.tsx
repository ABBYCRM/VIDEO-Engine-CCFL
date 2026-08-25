"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Atom,
  Bird,
  BrainCircuit,
  Car,
  Check,
  ChevronDown,
  ChevronUp,
  Cloud,
  Download,
  Film,
  Footprints,
  Image as ImageIcon,
  Instagram,
  Mic2,
  Play,
  RefreshCcw,
  Save,
  Shuffle,
  Smartphone,
  Sparkles,
  Truck,
  Upload,
  UserRound,
  WandSparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { A2E_VIDEO_MODELS, getA2eModel } from "@/lib/a2e-model-catalog";
import { DEFAULT_SPLIT_TEMPLATE_ID, SPLIT_TEMPLATES, type SplitTemplateId } from "@/lib/split-templates";

const modes = [
  { id: "car_accident", title: "Car Accident", icon: Car, sub: "Roadside, collision, aftermath" },
  { id: "rideshare", title: "Rideshare / Uber / Lyft", icon: Smartphone, sub: "Passenger and driver scenarios" },
  { id: "trucking", title: "Trucking / 18-Wheeler", icon: Truck, sub: "Commercial vehicle incidents" },
  { id: "slip_fall", title: "Slip & Fall", icon: Footprints, sub: "Premises-liability scenarios" },
  { id: "ugc", title: "UGC", icon: WandSparkles, sub: "Creator-style social creative" }
] as const;

type ProviderId = "veo" | "grok" | "a2e" | "hedra";
type ModelDef = { id: string; label: string; durations: number[] };
type CategoryId = typeof modes[number]["id"];
type OutputMode = "video" | "image" | "auto_mix";
type Job = { id: string; provider?: ProviderId; status: string; error?: string; fileUrl?: string | null };
type StillResult = { assetId: string; assetUrl: string; model: string; mimeType: string };
type MediaInput = { base64: string; mime: string; name: string };
type AvatarOption = {
  id: string;
  name: string;
  gender?: string;
  referenceImage: string | null;
  wardrobeRegenerationPrompt?: string | null;
  a2eTwinId?: string | null;
  a2eTwinAnchorId?: string | null;
  a2eTwinStatus?: "idle" | "training" | "ready" | "failed";
  a2eTwinError?: string | null;
  views?: { front?: { status?: string } };
};
type CampaignPlan = {
  mission: string;
  subject: string;
  script: string;
  hook: string;
  caption: string;
  visualDirection: string;
  rationale: string;
};

const providerModels: Record<ProviderId, ModelDef[]> = {
  veo: [
    { id: "veo-3.1-generate-preview", label: "Veo 3.1", durations: [8] },
    { id: "veo-3.1-fast-generate-preview", label: "Veo 3.1 Fast", durations: [8] }
  ],
  grok: [
    { id: "grok-imagine-video-1.5", label: "Grok Imagine Video 1.5", durations: [8, 15] },
    { id: "grok-imagine-video-1.0", label: "Grok Imagine Video 1.0", durations: [8, 15] }
  ],
  a2e: A2E_VIDEO_MODELS.map(({ id, label, durations }) => ({ id, label, durations })),
  hedra: [
    { id: "hedra-character-3", label: "Hedra Character-3", durations: [15, 30] },
    { id: "hedra-character-2", label: "Hedra Character-2", durations: [15, 30] }
  ]
};

const providers = [
  { id: "veo" as const, label: "Google Veo 3.1", icon: Sparkles, cap: "8s cinematic" },
  { id: "grok" as const, label: "xAI Grok Imagine", icon: Atom, cap: "up to 15s" },
  { id: "a2e" as const, label: "A2E AI multi-model", icon: Cloud, cap: "full hosted model catalog · up to 30s" },
  { id: "hedra" as const, label: "Hedra", icon: Bird, cap: "15/30s avatar · audio driven" }
];
const formats = [
  { id: "cinematic", label: "Cinematic" },
  { id: "ugc", label: "UGC / creator" },
  { id: "newsroom", label: "Newsroom" },
  { id: "direct", label: "Direct-to-camera" },
  { id: "podcast", label: "Podcast / split-screen" }
] as const;
const horizons = [3, 7, 14, 30] as const;

async function fileToMedia(file: File): Promise<MediaInput> {
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  return { base64, mime: file.type || "application/octet-stream", name: file.name };
}

export function GeneratorConsole() {
  const [category, setCategory] = useState<CategoryId>("car_accident");
  const [provider, setProvider] = useState<ProviderId>("veo");
  const [videoModel, setVideoModel] = useState(providerModels.veo[0].id);
  const [durationSeconds, setDurationSeconds] = useState(8);
  const [outputMode, setOutputMode] = useState<OutputMode>("video");
  const [autoNext, setAutoNext] = useState<"video" | "image">("video");
  const [contentFormat, setContentFormat] = useState("cinematic");
  const [splitPercent, setSplitPercent] = useState(35);
  const [splitRelationship, setSplitRelationship] = useState("anchor_field");
  const [splitTemplate, setSplitTemplate] = useState<SplitTemplateId>(DEFAULT_SPLIT_TEMPLATE_ID);
  const [upperProvider, setUpperProvider] = useState<Exclude<ProviderId, "hedra">>("grok");
  const [upperModel, setUpperModel] = useState(providerModels.grok[0].id);
  const [campaignName, setCampaignName] = useState("New campaign");
  const [website, setWebsite] = useState("");
  const [planningHorizonDays, setPlanningHorizonDays] = useState<3 | 7 | 14 | 30>(7);
  const [autoPost, setAutoPost] = useState(false);
  const [campaignSaving, setCampaignSaving] = useState(false);
  const [campaignSaved, setCampaignSaved] = useState<string | null>(null);
  const [settings, setSettings] = useState<any>(null);
  const [avatars, setAvatars] = useState<AvatarOption[]>([]);
  const [selectedAvatar, setSelectedAvatar] = useState("");
  const [loadingAvatar, setLoadingAvatar] = useState(false);
  const [mission, setMission] = useState("");
  const [subject, setSubject] = useState("");
  const [script, setScript] = useState("");
  const [plan, setPlan] = useState<CampaignPlan | null>(null);
  const [planning, setPlanning] = useState(false);
  const [showOverrides, setShowOverrides] = useState(false);
  const [image, setImage] = useState<MediaInput | null>(null);
  const [audio, setAudio] = useState<MediaInput | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [still, setStill] = useState<StillResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [instagramState, setInstagramState] = useState<"idle" | "posting" | "posted">("idle");
  const [error, setError] = useState<string | null>(null);
  const [flippedJob, setFlippedJob] = useState<string | null>(null);

  const selectedProvider = providers.find((p) => p.id === provider)!;
  const selectedMode = modes.find((m) => m.id === category)!;
  const effectiveOutput: "video" | "image" = outputMode === "auto_mix" ? autoNext : outputMode;
  const modelDef = providerModels[provider].find((m) => m.id === videoModel) || providerModels[provider][0];
  const a2eDef = provider === "a2e" ? getA2eModel(videoModel) : null;
  const selectedAvatarObj = useMemo(() => avatars.find((a) => a.id === selectedAvatar) || null, [avatars, selectedAvatar]);
  const needsAudio = effectiveOutput === "video" && (provider === "hedra" || Boolean(a2eDef?.requiresAudio));
  const needsImage = effectiveOutput === "video" && (provider === "hedra" || Boolean(a2eDef?.requiresImage));
  const needsTwin = effectiveOutput === "video" && provider === "a2e" && Boolean(a2eDef?.requiresTwin);
  const twinReady = !needsTwin || Boolean(selectedAvatarObj?.a2eTwinStatus === "ready" && selectedAvatarObj?.a2eTwinAnchorId);
  const inputReady = effectiveOutput !== "video" || (
    (!needsImage || Boolean(image)) &&
    (!needsAudio || Boolean(audio)) &&
    twinReady
  );
  const currentOutputLabel = effectiveOutput === "image" ? "Still image" : "Video";

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/settings").then((r) => r.ok ? r.json() : null),
      fetch("/api/admin/avatars", { cache: "no-store" }).then((r) => r.ok ? r.json() : { avatars: [] })
    ]).then(([s, a]) => {
      const initial = (s?.defaultProvider || "veo") as ProviderId;
      const supportedInitial = providerModels[initial] ? initial : "veo";
      const configured = String(s?.providers?.[supportedInitial]?.model || "");
      const def = providerModels[supportedInitial].find((m) => m.id === configured) || providerModels[supportedInitial][0];
      setSettings(s);
      setProvider(supportedInitial);
      setVideoModel(def.id);
      setDurationSeconds(def.durations[def.durations.length - 1]);
      setAvatars(a?.avatars || []);
      void planCreative("car_accident", supportedInitial, def.id, "", "video", def.durations[def.durations.length - 1], a?.avatars || []);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedAvatar || !avatars.length) return;
    const preferred = avatars.find((a) => a.id === "male-attorney-01") || avatars.find((a) => a.gender === "male");
    if (preferred) void chooseAvatar(preferred.id);
  }, [avatars, selectedAvatar]);

  useEffect(() => {
    if (!job?.id || ["succeeded", "failed"].includes(job.status)) return;
    const timer = window.setInterval(async () => {
      const r = await fetch(`/api/v1/video/${job.id}`, { cache: "no-store" });
      if (r.ok) {
        const d = await r.json();
        setJob((old) => ({ ...old, ...d } as Job));
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [job?.id, job?.status]);

  useEffect(() => {
    if (outputMode === "auto_mix" && job?.status === "succeeded" && job.id && flippedJob !== job.id) {
      setFlippedJob(job.id);
      setAutoNext("image");
    }
  }, [outputMode, job?.status, job?.id, flippedJob]);

  function defaultDuration(p: ProviderId, modelId?: string) {
    const def = providerModels[p].find((m) => m.id === modelId) || providerModels[p][0];
    return def.durations[def.durations.length - 1];
  }

  function changeProvider(next: ProviderId) {
    const configured = String(settings?.providers?.[next]?.model || "");
    const def = providerModels[next].find((m) => m.id === configured) || providerModels[next][0];
    const seconds = def.durations[def.durations.length - 1];
    setProvider(next);
    setVideoModel(def.id);
    setDurationSeconds(seconds);
    setJob(null);
    setError(null);
    void planCreative(category, next, def.id, selectedAvatar, outputMode, seconds);
  }

  function changeModel(model: string) {
    const def = providerModels[provider].find((m) => m.id === model) || providerModels[provider][0];
    const seconds = def.durations[def.durations.length - 1];
    setVideoModel(def.id);
    setDurationSeconds(seconds);
    setJob(null);
    setError(null);
    void planCreative(category, provider, def.id, selectedAvatar, outputMode, seconds);
  }

  async function planCreative(
    nextCategory: CategoryId = category,
    nextProvider: ProviderId = provider,
    nextModel: string = videoModel,
    nextAvatarId: string = selectedAvatar,
    nextOutput: OutputMode = outputMode,
    nextDuration: number = durationSeconds,
    avatarList: AvatarOption[] = avatars
  ) {
    setPlanning(true);
    setError(null);
    try {
      const avatarName = avatarList.find((a) => a.id === nextAvatarId)?.name || null;
      const r = await fetch("/api/internal/campaign-plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          category: nextCategory,
          provider: nextProvider,
          model: nextModel,
          durationSeconds: nextDuration,
          avatarName,
          outputMode: nextOutput
        })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setPlan(d.plan);
      setMission(d.plan.mission);
      setSubject(d.plan.subject);
      setScript(d.plan.script || "");
    } catch (e) {
      setPlan(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPlanning(false);
    }
  }

  async function chooseImage(file?: File) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError("Reference image must be 10MB or smaller.");
      return;
    }
    setImage(await fileToMedia(file));
    setSelectedAvatar("");
    setError(null);
  }

  async function chooseAvatar(avatarId: string) {
    setSelectedAvatar(avatarId);
    if (!avatarId) {
      setImage(null);
      void planCreative(category, provider, videoModel, "", outputMode, durationSeconds);
      return;
    }
    let avatar = avatars.find((a) => a.id === avatarId);
    if (!avatar) return;
    setLoadingAvatar(true);
    setError(null);
    try {
      if (avatar.a2eTwinStatus === "training") {
        const twinRes = await fetch(`/api/admin/avatars/${encodeURIComponent(avatarId)}/a2e-twin`, { cache: "no-store" });
        if (twinRes.ok) {
          const d = await twinRes.json();
          avatar = { ...avatar, a2eTwinId: d.twin?.id, a2eTwinAnchorId: d.twin?.anchorId, a2eTwinStatus: d.twin?.status, a2eTwinError: d.twin?.error };
          setAvatars((old) => old.map((a) => a.id === avatarId ? avatar! : a));
        }
      }
      const frontReady = avatar.views?.front?.status === "ready";
      if (!frontReady && avatar.wardrobeRegenerationPrompt) {
        throw new Error(`${avatar.name} is identity-reference only. Generate or upload the professional canonical front view in Avatars before campaign production.`);
      }
      const view = frontReady ? "front" : "reference";
      if (view === "reference" && !avatar.referenceImage) throw new Error("This avatar has no usable canonical/reference identity yet.");
      const r = await fetch(`/api/admin/avatars/${encodeURIComponent(avatar.id)}/asset?view=${view}`, { cache: "no-store" });
      if (!r.ok) throw new Error(`Could not load ${avatar.name} ${view} image`);
      const blob = await r.blob();
      setImage(await fileToMedia(new File([blob], `${avatar.id}-${view}.png`, { type: blob.type || "image/png" })));
      await planCreative(category, provider, videoModel, avatarId, outputMode, durationSeconds);
    } catch (e) {
      setSelectedAvatar("");
      setImage(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingAvatar(false);
    }
  }

  async function chooseAudio(file?: File) {
    if (!file) return;
    if (file.size > 105 * 1024 * 1024) {
      setError("Driving audio must be 105MB or smaller.");
      return;
    }
    setAudio(await fileToMedia(file));
    setError(null);
  }

  function setOutput(next: OutputMode) {
    setOutputMode(next);
    setAutoNext("video");
    setJob(null);
    setStill(null);
    setInstagramState("idle");
    void planCreative(category, provider, videoModel, selectedAvatar, next, durationSeconds);
  }

  function setFormat(next: string) {
    setContentFormat(next);
    if (next === "podcast" && outputMode === "image") setOutput("video");
    if (next === "podcast") {
      const nextUpper = provider === "hedra" ? "grok" : provider;
      setUpperProvider(nextUpper);
      setUpperModel(providerModels[nextUpper][0].id);
    }
  }

  function changeUpperProvider(next: Exclude<ProviderId, "hedra">) {
    setUpperProvider(next);
    setUpperModel(providerModels[next][0].id);
  }

  async function generate() {
    if (contentFormat === "podcast") {
      setError("Podcast / split-screen uses the two-lane production step below. Continue there with the current campaign settings.");
      return;
    }
    if (!plan && !mission.trim()) {
      setError("The AI creative plan is not ready. Regenerate the AI plan first.");
      return;
    }
    if (effectiveOutput === "video" && needsImage && !image) {
      setError(`${a2eDef?.label || selectedProvider.label} requires a campaign-safe reference image or canonical avatar.`);
      return;
    }
    if (effectiveOutput === "video" && needsTwin && !twinReady) {
      setError(`${selectedAvatarObj?.name || "The selected avatar"} does not have a ready A2E Video Twin. Train it in Avatars first.`);
      return;
    }
    if (effectiveOutput === "video" && needsAudio && !audio) {
      setError(`${a2eDef?.label || "Hedra"} requires driving audio.`);
      return;
    }

    setBusy(true);
    setJob(null);
    setStill(null);
    setError(null);
    setInstagramState("idle");
    try {
      if (effectiveOutput === "image") {
        const prompt = [
          plan?.hook ? `Hook concept: ${plan.hook}.` : "",
          subject,
          plan?.visualDirection || mission,
          selectedMode.sub
        ].filter(Boolean).join("\n");
        const r = await fetch("/api/internal/campaign-image", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ prompt, avatarId: selectedAvatar || null })
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
        setStill(d);
        if (outputMode === "auto_mix") setAutoNext("video");
        return;
      }

      const compiledMission = [mission, plan?.visualDirection ? `Visual direction: ${plan.visualDirection}` : ""].filter(Boolean).join("\n");
      const r = await fetch("/api/internal/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider,
          model: videoModel,
          category,
          mission: compiledMission,
          subject,
          script,
          durationSeconds,
          avatarId: selectedAvatar || undefined,
          imageBase64: image?.base64,
          imageMimeType: image?.mime,
          audioBase64: audio?.base64,
          audioMimeType: audio?.mime
        })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setJob({ ...d.job, provider });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (effectiveOutput === "video") setJob({ id: "", provider, status: "failed", error: message });
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  async function saveCampaign() {
    if (!plan && !mission.trim()) {
      setError("Generate the AI campaign plan before filling Calendar.");
      return;
    }
    setCampaignSaving(true);
    setCampaignSaved(null);
    setError(null);
    try {
      const r = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: campaignName,
          website,
          category,
          contentType: contentFormat,
          outputMode: contentFormat === "podcast" ? "video" : outputMode,
          avatarId: selectedAvatar,
          mission: mission || plan?.mission,
          platform: "instagram",
          planningHorizonDays,
          autoPost,
          videoProvider: provider,
          videoModel,
          upperProvider: contentFormat === "podcast" ? upperProvider : undefined,
          upperModel: contentFormat === "podcast" ? upperModel : undefined,
          splitPercent: contentFormat === "podcast" ? splitPercent : undefined,
          splitRelationship: contentFormat === "podcast" ? splitRelationship : undefined,
          splitTemplate: contentFormat === "podcast" ? splitTemplate : undefined
        })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setCampaignSaved(`${d.calendarCount || 0} Calendar slots created`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCampaignSaving(false);
    }
  }

  async function postToInstagram() {
    const mediaUrl = still?.assetUrl || null;
    const jobId = job?.status === "succeeded" ? job.id : null;
    if (!mediaUrl && !jobId) return;
    if (!confirm(`Publish this ${still ? "image" : "video"} to the connected Instagram Business/Creator account now?`)) return;
    setInstagramState("posting");
    setError(null);
    try {
      const r = await fetch("/api/publish/instagram", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jobId,
          mediaUrl,
          mediaType: still?.mimeType || null,
          caption: plan?.caption || mission || script || `${selectedMode.title} generated content`
        })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setInstagramState("posted");
    } catch (e) {
      setInstagramState("idle");
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const splitParams = new URLSearchParams({
    category,
    lowerProvider: provider,
    lowerModel: videoModel,
    upperProvider: contentFormat === "podcast" ? upperProvider : (provider === "hedra" ? "veo" : provider),
    upperModel,
    avatar: selectedAvatar,
    campaignName,
    website,
    horizon: String(planningHorizonDays),
    autoPost: autoPost ? "1" : "0",
    splitPercent: String(splitPercent),
    relationship: splitRelationship,
    splitTemplate
  });
  const splitHref = `/podcast-interview?${splitParams.toString()}`;

  return <main>
    <div className="mb-7">
      <div className="mb-2 text-sm font-medium text-violet-700">Campaign production</div>
      <h1 className="text-[34px] font-semibold leading-tight tracking-tight text-slate-900">Create</h1>
      <p className="mt-1 max-w-4xl text-[15px] text-slate-600">One campaign workspace: choose the scenario, output, provider/model, spokesperson and schedule. AI writes the creative brief. Podcast / split-screen continues into a two-lane production step without losing these settings.</p>
    </div>

    <section className="mb-6 rounded-2xl border bg-white p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div><h2 className="font-semibold">Campaign setup</h2><p className="text-xs text-slate-500">Create is the single campaign builder; Campaigns is saved-plan history.</p></div>
        <Link href="/campaigns" className="text-sm font-medium text-violet-700 hover:underline">Saved campaigns →</Link>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-2 text-sm"><span className="font-medium text-slate-700">Campaign name</span><Input aria-label="Campaign name" value={campaignName} onChange={(e) => setCampaignName(e.target.value)} /></label>
        <label className="grid gap-2 text-sm"><span className="font-medium text-slate-700">Website / landing page</span><Input aria-label="Website / landing page" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="Optional" /></label>
        <label className="grid gap-2 text-sm"><span className="font-medium text-slate-700">Content format</span><select aria-label="Content format" value={contentFormat} onChange={(e) => setFormat(e.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3">{formats.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select></label>
        <label className="grid gap-2 text-sm"><span className="font-medium text-slate-700">Fill Calendar for</span><select aria-label="Fill Calendar for" value={planningHorizonDays} onChange={(e) => setPlanningHorizonDays(Number(e.target.value) as 3 | 7 | 14 | 30)} className="h-11 rounded-xl border border-slate-200 bg-white px-3">{horizons.map((h) => <option key={h} value={h}>{h} days</option>)}</select></label>
      </div>
      <label className="mt-4 flex items-center gap-3 rounded-xl border bg-slate-50 p-3"><input type="checkbox" checked={autoPost} onChange={(e) => setAutoPost(e.target.checked)} /><span><strong className="text-sm">Auto-post approved content when due</strong><br /><span className="text-xs text-slate-500">Off keeps every Calendar item in owner review/manual-post mode.</span></span></label>
    </section>

    <div className="mb-2 text-xs uppercase tracking-wider text-slate-500">Output mix</div>
    <div className="grid gap-3 md:grid-cols-3">
      <button type="button" onClick={() => setOutput("video")} className={`rounded-2xl border p-4 text-left ${outputMode === "video" ? "border-violet-400 bg-violet-50" : "bg-white hover:border-violet-300"}`}><Film /><div className="mt-2 font-semibold">Video</div><div className="text-xs text-slate-500">Generate video posts with the selected engine.</div></button>
      <button type="button" onClick={() => setOutput("image")} disabled={contentFormat === "podcast"} className={`rounded-2xl border p-4 text-left disabled:cursor-not-allowed disabled:opacity-50 ${outputMode === "image" ? "border-violet-400 bg-violet-50" : "bg-white hover:border-violet-300"}`}><ImageIcon /><div className="mt-2 font-semibold">Still image</div><div className="text-xs text-slate-500">Generate a campaign still; canonical identity is preserved when supported.</div></button>
      <button type="button" onClick={() => setOutput("auto_mix")} disabled={contentFormat === "podcast"} className={`rounded-2xl border p-4 text-left disabled:cursor-not-allowed disabled:opacity-50 ${outputMode === "auto_mix" ? "border-violet-400 bg-violet-50" : "bg-white hover:border-violet-300"}`}><Shuffle /><div className="mt-2 font-semibold">Auto mix</div><div className="text-xs text-slate-500">Alternates Video → Still → Video → Still in Calendar and Generate now.</div></button>
    </div>

    <div className="mb-2 mt-6 text-xs uppercase tracking-wider text-slate-500">Campaign type · AI creative brief</div>
    <div className="grid gap-3 md:grid-cols-5">{modes.map((m) => { const I = m.icon; const active = category === m.id; return <button type="button" key={m.id} onClick={() => { setCategory(m.id); void planCreative(m.id, provider, videoModel, selectedAvatar, outputMode, durationSeconds); }} className={`rounded-2xl border p-4 text-left transition ${active ? "border-violet-400 bg-violet-50" : "border-slate-200 bg-white hover:border-violet-300"}`}><I /><div className="mt-2 font-medium">{m.title}</div><div className="text-xs text-slate-500">{m.sub}</div></button>; })}</div>

    {outputMode !== "image" && <>
      <div className="mb-2 mt-6 text-xs uppercase tracking-wider text-slate-500">Video engine</div>
      <div className="grid gap-3 md:grid-cols-4">{providers.map((p) => { const I = p.icon; const active = provider === p.id; const configured = settings?.providers?.[p.id]?.keyConfigured; return <button type="button" key={p.id} onClick={() => changeProvider(p.id)} className={`rounded-2xl border p-4 text-left transition ${active ? "border-violet-400 bg-violet-50 ring-1 ring-violet-200" : "border-slate-200 bg-white hover:border-violet-300"}`}><I className={active ? "text-violet-600" : "text-slate-500"} /><div className="mt-2 font-medium">{p.label}</div><div className="text-xs text-slate-500">{p.cap}{configured === false ? " · key needed" : ""}</div></button>; })}</div>
      <div className="mt-3 grid gap-3 rounded-2xl border bg-white p-4 md:grid-cols-2">
        <label className="grid gap-1 text-xs font-medium text-slate-600">Video model<select aria-label="Video model" value={videoModel} onChange={(e) => changeModel(e.target.value)} className="h-10 rounded-xl border px-3 text-sm">{providerModels[provider].map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select></label>
        <label className="grid gap-1 text-xs font-medium text-slate-600">Duration<select aria-label="Video duration" value={durationSeconds} onChange={(e) => { const value = Number(e.target.value); setDurationSeconds(value); void planCreative(category, provider, videoModel, selectedAvatar, outputMode, value); }} className="h-10 rounded-xl border px-3 text-sm">{modelDef.durations.map((d) => <option key={d} value={d}>{d} seconds</option>)}</select></label>
        {a2eDef && <div className="md:col-span-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900"><strong>{a2eDef.label}</strong> · {a2eDef.description}{a2eDef.requiresTwin ? " · trained canonical avatar required" : ""}{a2eDef.requiresImage ? " · reference image required" : ""}{a2eDef.requiresAudio ? " · driving audio required" : ""}</div>}
      </div>
    </>}

    {contentFormat === "podcast" && <section className="mt-6 rounded-2xl border-2 border-violet-300 bg-violet-50 p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2 font-semibold text-violet-950"><Mic2 size={18} />Split-screen surface</div>
          <p className="mt-1 max-w-3xl text-sm text-violet-800">Calendar autopilot generates two independent 8-second lanes, then composites them at this ratio. The Video engine above is the lower lane. Hedra/audio-driven lowers fall back to Grok when Calendar runs unattended.</p>
        </div>
        <Link href={splitHref}><Button size="lg"><Mic2 size={16} className="mr-2" />Continue to two-lane production</Button></Link>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="grid gap-1 text-xs font-medium text-violet-900">Split relationship<select aria-label="Split relationship" value={splitRelationship} onChange={(e) => setSplitRelationship(e.target.value)} className="h-11 rounded-xl border border-violet-200 bg-white px-3 text-sm"><option value="anchor_field">Studio anchor asks · field reporter answers</option><option value="question_answer">Upper asks · lower answers</option><option value="context_commentary">Upper context · lower explains</option><option value="reaction">Upper scenario · lower reacts</option><option value="parallel">Parallel complementary stories</option></select></label>
        <label className="grid gap-1 text-xs font-medium text-violet-900">Upper engine<select aria-label="Upper AI engine" value={upperProvider} onChange={(e) => changeUpperProvider(e.target.value as Exclude<ProviderId, "hedra">)} className="h-11 rounded-xl border border-violet-200 bg-white px-3 text-sm"><option value="grok">xAI Grok</option><option value="veo">Google Veo</option><option value="a2e">A2E multi-model</option></select></label>
        <label className="grid gap-1 text-xs font-medium text-violet-900">Upper model<select aria-label="Upper video model" value={upperModel} onChange={(e) => setUpperModel(e.target.value)} className="h-11 rounded-xl border border-violet-200 bg-white px-3 text-sm">{providerModels[upperProvider].map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select></label>
        <label className="grid gap-1 text-xs font-medium text-violet-900">Frame template<select aria-label="Split-screen frame template" value={splitTemplate} onChange={(e) => setSplitTemplate(e.target.value as SplitTemplateId)} className="h-11 rounded-xl border border-violet-200 bg-white px-3 text-sm">{SPLIT_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
      </div>
    </section>}

    <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
      <div className="soro-card p-5">
        <div className="grid gap-4">
          <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
            <div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2 font-semibold text-violet-950"><BrainCircuit size={17} />AI campaign plan</div><p className="mt-1 text-xs text-violet-800">The campaign, exact model and duration are the brief. NVIDIA writes the hook, scene/frame direction, dialogue and post copy for the selected engine.</p></div><Button size="sm" variant="secondary" onClick={() => planCreative()} disabled={planning}>{planning ? <><RefreshCcw size={13} className="mr-1 animate-spin" />Planning…</> : "Regenerate AI plan"}</Button></div>
            {plan && !planning && <div className="mt-4 grid gap-3 text-sm"><div><div className="text-[10px] font-semibold uppercase text-violet-700">Hook</div><div className="font-semibold text-slate-900">{plan.hook}</div></div><div><div className="text-[10px] font-semibold uppercase text-violet-700">Creative mission</div><div className="text-slate-700">{mission}</div></div><div><div className="text-[10px] font-semibold uppercase text-violet-700">Visual direction</div><div className="text-slate-700">{plan.visualDirection}</div></div>{script && effectiveOutput === "video" && <div><div className="text-[10px] font-semibold uppercase text-violet-700">Dialogue</div><div className="text-slate-700">{script}</div></div>}<div className="text-xs italic text-violet-800">{plan.rationale}</div></div>}
            {planning && <div className="mt-4 text-sm text-violet-800">Planning campaign…</div>}
          </div>

          <button type="button" onClick={() => setShowOverrides((v) => !v)} className="flex w-full items-center justify-between rounded-xl border bg-slate-50 px-4 py-3 text-left text-sm font-semibold text-slate-800"><span>Optional operator overrides</span>{showOverrides ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>
          {showOverrides && <div className="grid gap-4"><label className="grid gap-2 text-sm"><span className="font-medium text-slate-700">Mission override</span><Textarea value={mission} onChange={(e) => setMission(e.target.value)} /></label><label className="grid gap-2 text-sm"><span className="font-medium text-slate-700">Subject / spokesperson override</span><Input value={subject} onChange={(e) => setSubject(e.target.value)} /></label><label className="grid gap-2 text-sm"><span className="font-medium text-slate-700">Dialogue override</span><Textarea value={script} onChange={(e) => setScript(e.target.value)} /></label></div>}

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800"><UserRound size={16} />Spokesperson / reference</div>
            <label className="grid gap-2 text-sm"><span className="font-medium text-slate-700">Choose canonical avatar</span><select aria-label="Choose canonical avatar" value={selectedAvatar} onChange={(e) => chooseAvatar(e.target.value)} disabled={loadingAvatar} className="h-11 rounded-xl border border-slate-200 bg-white px-3"><option value="">AI chooses / use one-off reference</option>{avatars.map((a) => <option key={a.id} value={a.id}>{a.name}{a.a2eTwinStatus === "ready" ? " · A2E twin ready" : a.views?.front?.status === "ready" ? " · canonical ready" : a.wardrobeRegenerationPrompt ? " · canonical front required" : " · reference ready"}</option>)}</select></label>
            {selectedAvatarObj && <div className={`mt-2 text-xs ${needsTwin && !twinReady ? "text-amber-700" : "text-emerald-700"}`}>{needsTwin ? (twinReady ? `A2E Video Twin ready for ${selectedAvatarObj.name}.` : `${selectedAvatarObj.name}: A2E Video Twin ${selectedAvatarObj.a2eTwinStatus || "not trained"}. Open Avatars to train it.`) : `Loaded campaign-safe identity for ${selectedAvatarObj.name}.`}</div>}
            <div className="my-3 flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-400"><span className="h-px flex-1 bg-slate-200" />or upload one-off reference for video<span className="h-px flex-1 bg-slate-200" /></div>
            <label className="grid gap-2 text-sm"><span className="font-medium text-slate-700">Reference image {needsImage ? "(required if no avatar selected)" : "(optional)"}</span><div className="flex items-center gap-3"><Input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => chooseImage(e.target.files?.[0])} /><Upload size={18} /></div>{image && <span className="text-xs text-emerald-700">Using: {image.name}</span>}</label>
          </div>

          {needsAudio && contentFormat !== "podcast" && <div className="grid gap-4 rounded-xl border border-violet-200 bg-violet-50 p-4"><label className="grid gap-2 text-sm"><span className="font-medium text-violet-900">Driving audio (required)</span><Input type="file" accept="audio/*" onChange={(e) => chooseAudio(e.target.files?.[0])} />{audio && <span className="text-xs text-emerald-700">Loaded: {audio.name}</span>}<span className="text-xs text-violet-700">{needsTwin ? "A2E Video Twin animates the trained canonical identity from this audio." : "Hedra animates the selected canonical identity from this audio."}</span></label></div>}

          <div className="grid gap-2 sm:grid-cols-2">
            {contentFormat === "podcast" ? <Link href={splitHref}><Button size="lg" className="w-full"><Mic2 size={17} className="mr-2" />Continue to split-screen</Button></Link> : <Button size="lg" disabled={busy || planning || loadingAvatar || !inputReady || !plan} onClick={generate}>{effectiveOutput === "image" ? <ImageIcon size={17} className="mr-2" /> : <Play size={17} className="mr-2" />}{busy ? "Generating…" : outputMode === "auto_mix" ? `Generate next · ${currentOutputLabel}` : effectiveOutput === "image" ? "Generate still image" : `Generate ${durationSeconds}s with ${selectedProvider.label}`}</Button>}
            <Button size="lg" variant="secondary" onClick={saveCampaign} disabled={campaignSaving || planning || !plan || !campaignName.trim()}><Save size={16} className="mr-2" />{campaignSaving ? "Saving…" : "Save campaign + fill Calendar"}</Button>
          </div>

          {outputMode === "auto_mix" && contentFormat !== "podcast" && <div className="rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-700"><Shuffle size={13} className="mr-1 inline" />Auto mix next output: <strong>{currentOutputLabel}</strong>. Each successful Generate now flips to the other type.</div>}
          {campaignSaved && <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700"><Check size={15} />{campaignSaved}. <Link href="/calendar" className="font-semibold underline">Review Calendar</Link></div>}
        </div>
      </div>

      <div className="soro-card min-h-[470px] p-5">
        <div className="mb-4 flex items-start justify-between gap-3"><div><div className="font-medium">Generated output</div><div className="text-xs text-slate-500">{contentFormat === "podcast" ? "Split-screen production continues in the two-lane step" : `${outputMode === "auto_mix" ? "Auto mix" : currentOutputLabel} · generated media lands in Library + Calendar automatically`}</div></div>{job && <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase">{job.status}</span>}</div>
        {contentFormat === "podcast" ? <div className="grid h-[330px] place-items-center rounded-xl border border-dashed border-violet-200 bg-violet-50 p-8 text-center"><div><Mic2 className="mx-auto mb-3 text-violet-600" /><div className="font-semibold text-violet-950">Two-lane output</div><p className="mt-1 max-w-sm text-sm text-violet-700">Generate the upper and lower videos independently, render the final 9:16 composition, then download, Calendar-review, or post it straight to Instagram.</p><Link href={splitHref} className="mt-4 inline-block"><Button>Open two-lane production</Button></Link></div></div> : <>
          {!job && !still && <div className="grid h-[330px] place-items-center rounded-xl border border-dashed border-slate-200 text-center text-sm text-slate-500">AI-planned media appears here.</div>}
          {error && <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
          {job?.status === "failed" && <div className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{job.error}</div>}
          {job && !["succeeded", "failed"].includes(job.status) && <div className="grid h-[330px] place-items-center text-sm"><div className="text-center"><div className="mx-auto mb-3 h-9 w-9 animate-spin rounded-full border-2 border-slate-200 border-t-violet-600" />{selectedProvider.label} is generating…</div></div>}
          {job?.status === "succeeded" && job.fileUrl && <div><video src={job.fileUrl} className="max-h-[430px] w-full rounded-xl bg-black" controls autoPlay playsInline /><OutputActions mediaUrl={job.fileUrl} onInstagram={postToInstagram} instagramState={instagramState} /></div>}
          {still && <div><img src={still.assetUrl} alt="Generated campaign still" className="max-h-[520px] w-full rounded-xl bg-slate-100 object-contain" /><div className="mt-2 text-xs text-slate-500">{still.model} · saved to Generated Media and Calendar</div><OutputActions mediaUrl={still.assetUrl} onInstagram={postToInstagram} instagramState={instagramState} /></div>}
        </>}
      </div>
    </div>
  </main>;
}

function OutputActions({ mediaUrl, onInstagram, instagramState }: { mediaUrl: string; onInstagram: () => void; instagramState: "idle" | "posting" | "posted" }) {
  return <div className="mt-4 flex flex-wrap items-center gap-3">
    <div className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700"><Check size={13} className="mr-1 inline" />Automatically added to Library + Calendar</div>
    <a href={mediaUrl} download><Button variant="secondary"><Download size={15} className="mr-2" />Download</Button></a>
    <Button variant="secondary" onClick={onInstagram} disabled={instagramState !== "idle"}><Instagram size={15} className="mr-2" />{instagramState === "posted" ? "Posted to Instagram" : instagramState === "posting" ? "Publishing…" : "Post to Instagram now"}</Button>
    <Link href="/calendar" className="text-sm font-medium text-violet-700 hover:underline">Open Calendar →</Link>
  </div>;
}
