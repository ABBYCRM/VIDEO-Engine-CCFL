"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Film,
  Image as ImageIcon,
  Play,
  RefreshCcw,
  Wand2,
  Loader2,
  User,
  MessageCircle,
  Check,
  Sparkles,
  Globe
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { contentTemplates, type ContentTemplateId } from "@/lib/prompts";
import { visualTemplates, type VisualTemplateId } from "@/lib/visual-templates";

type AvatarOption = {
  id: string;
  name: string;
  gender: string;
  referenceImage: string | null;
  a2eTwinStatus?: string;
};

const TEMPLATE_TABS: Array<{
  id: ContentTemplateId;
  label: string;
  icon: typeof Film;
}> = [
  { id: "reel", label: "Reel", icon: Film },
  { id: "story", label: "Story", icon: ImageIcon },
  { id: "ugc", label: "UGC", icon: MessageCircle },
  { id: "cinematic", label: "Cinematic", icon: Play },
];

const VIDEO_MODELS = [
  { id: "grok-imagine-video-1.5", label: "Grok Imagine 1.5" },
  { id: "grok-imagine-video-1.0", label: "Grok Imagine 1.0" },
];

const LANGUAGES = [
  { id: "english", label: "English" },
  { id: "spanish", label: "Spanish" },
  { id: "mixed", label: "Spanglish Mix" },
];

export function GeneratorConsole() {
  const [activeTemplate, setActiveTemplate] = useState<ContentTemplateId>("reel");
  const [selectedModel, setSelectedModel] = useState("grok-imagine-video-1.5");
  const [prompt, setPrompt] = useState("");
  const [script, setScript] = useState("");
  const [duration, setDuration] = useState(8);
  const [selectedMale, setSelectedMale] = useState<string | null>(null);
  const [selectedFemale, setSelectedFemale] = useState<string | null>(null);
  const [useMale, setUseMale] = useState(true);
  const [language, setLanguage] = useState<"english" | "spanish" | "mixed">("mixed");
  const [selectedTemplate, setSelectedTemplate] = useState<VisualTemplateId>("auto");
  const [avatars, setAvatars] = useState<AvatarOption[]>([]);
  const [generating, setGenerating] = useState(false);
  const [jobs, setJobs] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/admin/avatars")
      .then(r => r.json())
      .then(d => setAvatars(d.avatars || []))
      .catch(() => {});
  }, []);

  const maleAvatars = useMemo(() => avatars.filter(a => a.gender === "male"), [avatars]);
  const femaleAvatars = useMemo(() => avatars.filter(a => a.gender === "female"), [avatars]);
  const template = contentTemplates[activeTemplate];

  const scriptWordCount = useMemo(() => {
    return script.trim().split(/\s+/).filter(Boolean).length;
  }, [script]);

  async function generate() {
    setGenerating(true);
    try {
      const avatarId = useMale ? selectedMale : selectedFemale;
      const res = await fetch("/api/internal/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template: activeTemplate,
          visualTemplate: selectedTemplate,
          prompt: prompt || `Hyper-realistic ${template.title}`,
          script: script || undefined,
          model: selectedModel,
          aspectRatio: template.aspectRatio,
          resolution: "1080p",
          durationSeconds: duration,
          avatarId,
          provider: "grok",
          language,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      loadJobs();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  const loadJobs = useCallback(async () => {
    const r = await fetch("/api/library?limit=10");
    const d = await r.json();
    setJobs(d.assets || []);
  }, []);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  return (
    <div className="space-y-6">
      {/* Content Type Tabs */}
      <div className="grid grid-cols-4 gap-3">
        {TEMPLATE_TABS.map((t) => {
          const Icon = t.icon;
          const active = activeTemplate === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTemplate(t.id)}
              className={`relative rounded-xl border p-4 text-left transition-all ${
                active
                  ? "border-amber-500/60 bg-amber-500/10 shadow-lg shadow-amber-500/10"
                  : "border-slate-800 bg-slate-900/50 hover:border-slate-700"
              }`}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className={`p-2 rounded-lg ${active ? "bg-amber-500/20 text-amber-400" : "bg-slate-800 text-slate-400"}`}>
                  <Icon size={18} />
                </div>
                <span className={`font-semibold ${active ? "text-amber-100" : "text-slate-300"}`}>{t.label}</span>
              </div>
              <p className="text-xs text-slate-500">
                {t.id === "reel" && "9:16 vertical · Hyper-realistic"}
                {t.id === "story" && "9:16 vertical · Intimate & personal"}
                {t.id === "ugc" && "9:16 vertical · Creator style"}
                {t.id === "cinematic" && "16:9 landscape · Film quality"}
              </p>
            </button>
          );
        })}
      </div>

      {/* Visual Template Picker */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-amber-100 uppercase tracking-wider">Visual Style</h3>
          <span className="text-xs text-slate-500">
            {visualTemplates.find(t => t.id === selectedTemplate)?.label}
          </span>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {visualTemplates.map((tmpl) => (
            <button
              key={tmpl.id}
              onClick={() => setSelectedTemplate(tmpl.id)}
              className={`relative rounded-xl border overflow-hidden transition-all group ${
                selectedTemplate === tmpl.id
                  ? "border-amber-500 ring-2 ring-amber-500/30"
                  : "border-slate-800 hover:border-slate-600"
              }`}
            >
              <div className="aspect-[9/16] relative">
                {tmpl.image ? (
                  <img
                    src={tmpl.image}
                    alt={tmpl.label}
                    className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-amber-500/20 to-purple-500/20 flex items-center justify-center">
                    <Sparkles size={24} className="text-amber-400" />
                  </div>
                )}
                <div className={`absolute inset-0 flex items-end p-2 ${
                  selectedTemplate === tmpl.id
                    ? "bg-gradient-to-t from-amber-950/80 to-transparent"
                    : "bg-gradient-to-t from-black/80 to-transparent"
                }`}>
                  <span className={`text-xs font-medium ${
                    selectedTemplate === tmpl.id ? "text-amber-300" : "text-white"
                  }`}>
                    {tmpl.label}
                  </span>
                </div>
                {selectedTemplate === tmpl.id && (
                  <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center">
                    <Check size={12} className="text-black" />
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Main Studio Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Preview & Controls */}
        <div className="lg:col-span-2 space-y-4">
          {/* Video Preview Frame */}
          <div className="relative rounded-2xl overflow-hidden border border-amber-900/40 bg-black shadow-2xl">
            {/* REC Overlay */}
            <div className="absolute top-0 left-0 right-0 z-10 p-4 flex justify-between items-start pointer-events-none">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                <span className="text-red-500 text-sm font-bold tracking-widest">REC</span>
              </div>
              <div className="w-8 h-4 border-2 border-white/60 rounded-sm relative">
                <div className="absolute inset-0.5 bg-white/80 w-3/4" />
              </div>
            </div>

            {/* Corner Brackets */}
            <div className="absolute top-4 left-4 w-8 h-8 border-l-2 border-t-2 border-white/30 pointer-events-none" />
            <div className="absolute top-4 right-4 w-8 h-8 border-r-2 border-t-2 border-white/30 pointer-events-none" />
            <div className="absolute bottom-4 left-4 w-8 h-8 border-l-2 border-b-2 border-white/30 pointer-events-none" />
            <div className="absolute bottom-4 right-4 w-8 h-8 border-r-2 border-b-2 border-white/30 pointer-events-none" />

            {/* Timer */}
            <div className="absolute bottom-16 left-4 z-10 pointer-events-none">
              <span className="text-white/70 text-sm font-mono tracking-wider">LIVE 00:04:378</span>
            </div>

            {/* Center Gold Frame */}
            <div className="relative aspect-[9/16] max-h-[500px] mx-auto my-8">
              <div className="absolute inset-0 rounded-3xl border-2 border-amber-500/40 shadow-[0_0_40px_rgba(245,158,11,0.15)] bg-gradient-to-b from-amber-950/20 to-black/80 flex items-center justify-center">
                {jobs[0]?.url ? (
                  <video src={jobs[0].url} className="w-full h-full rounded-3xl object-cover" controls />
                ) : (
                  <div className="text-center space-y-3">
                    <Film size={48} className="mx-auto text-amber-500/30" />
                    <p className="text-amber-500/50 text-sm">Your hyper-realistic video<br/>will appear here</p>
                  </div>
                )}
              </div>
              <div className="absolute -inset-1 rounded-3xl bg-gradient-to-b from-amber-500/10 via-transparent to-amber-500/5 pointer-events-none" />
            </div>
          </div>

          {/* Prompt Input */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-amber-200">Scene Description</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={`Describe your ${template.title.toLowerCase()} scene...`}
              className="w-full h-24 rounded-xl bg-slate-900/80 border border-slate-700 text-slate-200 placeholder-slate-500 p-3 text-sm focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30 resize-none"
            />

            {/* Script Input with Word Counter */}
            <div className="relative">
              <label className="text-sm font-medium text-amber-200/70 mb-1 block flex items-center gap-2">
                <MessageCircle size={14} />
                Spoken Script (15-20 words max for 8-second delivery)
              </label>
              <textarea
                value={script}
                onChange={(e) => {
                  const val = e.target.value;
                  const words = val.trim().split(/\s+/).filter(Boolean);
                  if (words.length <= 25) setScript(val);
                }}
                placeholder="Type dialogue here... e.g. 'Hey guys, just got into an accident and I don\'t know what to do next...'"
                className="w-full h-16 rounded-xl bg-slate-900/80 border border-slate-700 text-slate-200 placeholder-slate-500 p-3 text-sm focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30 resize-none"
              />
              <div className="flex justify-between mt-1">
                <span className={`text-[10px] ${scriptWordCount > 20 ? "text-red-400" : "text-slate-600"}`}>
                  {scriptWordCount} / 20 words · ~{Math.ceil(scriptWordCount / 2.5)}s spoken
                </span>
                {scriptWordCount > 20 && (
                  <span className="text-[10px] text-red-400">⚠️ Will be truncated for 8s delivery</span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:border-amber-500/50"
              >
                {VIDEO_MODELS.map(m => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
              <select
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:border-amber-500/50"
              >
                <option value={5}>5s</option>
                <option value={8}>8s</option>
                <option value={10}>10s</option>
                <option value={15}>15s</option>
              </select>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as any)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:border-amber-500/50"
              >
                {LANGUAGES.map(l => (
                  <option key={l.id} value={l.id}>{l.label}</option>
                ))}
              </select>
              <div className="flex-1" />
              <Button
                onClick={generate}
                disabled={generating}
                className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-semibold px-6"
              >
                {generating ? <Loader2 className="animate-spin mr-2" size={16} /> : <Wand2 size={16} className="mr-2" />}
                {generating ? "Generating..." : "Generate"}
              </Button>
            </div>
          </div>
        </div>

        {/* Sidebar - Avatar Selection */}
        <div className="space-y-4">
          {/* Avatar Selection Box */}
          <div className="rounded-xl border border-amber-900/30 bg-slate-900/50 p-4 space-y-4">
            <h3 className="text-sm font-semibold text-amber-100 flex items-center gap-2">
              <Globe size={16} className="text-amber-400" />
              Select Avatar
            </h3>

            {/* Gender Toggle */}
            <div className="flex rounded-lg bg-slate-800 p-1">
              <button
                onClick={() => setUseMale(true)}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-all ${
                  useMale ? "bg-amber-500/20 text-amber-300" : "text-slate-500 hover:text-slate-300"
                }`}
              >
                <User size={16} /> Male
              </button>
              <button
                onClick={() => setUseMale(false)}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-all ${
                  !useMale ? "bg-amber-500/20 text-amber-300" : "text-slate-500 hover:text-slate-300"
                }`}
              >
                <User size={16} className="text-pink-400" /> Female
              </button>
            </div>

            {/* Avatar Grid */}
            <div className="space-y-2">
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">
                {useMale ? "Male Avatars" : "Female Avatars"}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {(useMale ? maleAvatars : femaleAvatars).map((avatar) => (
                  <button
                    key={avatar.id}
                    onClick={() => useMale ? setSelectedMale(avatar.id) : setSelectedFemale(avatar.id)}
                    className={`relative rounded-lg border p-2 text-left transition-all ${
                      (useMale ? selectedMale : selectedFemale) === avatar.id
                        ? "border-amber-500/60 bg-amber-500/10"
                        : "border-slate-700 bg-slate-800/50 hover:border-slate-600"
                    }`}
                  >
                    <div className="aspect-square rounded-md bg-slate-800 mb-2 overflow-hidden">
                      {avatar.referenceImage ? (
                        <img src={avatar.referenceImage} alt={avatar.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-600 text-xs font-bold">
                          {avatar.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <p className="text-xs font-medium text-slate-300 truncate">{avatar.name}</p>
                    {avatar.a2eTwinStatus === "ready" && (
                      <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-500" title="Twin Ready" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Selected Summary */}
            <div className="pt-3 border-t border-slate-800">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Check size={14} className="text-emerald-500" />
                <span>
                  {useMale
                    ? (maleAvatars.find(a => a.id === selectedMale)?.name || "No male avatar selected")
                    : (femaleAvatars.find(a => a.id === selectedFemale)?.name || "No female avatar selected")
                  }
                </span>
              </div>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Format</span>
              <span className="text-amber-300 font-mono">{template.aspectRatio}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Duration</span>
              <span className="text-amber-300 font-mono">{duration}s</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Engine</span>
              <span className="text-amber-300 font-mono">Grok</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Model</span>
              <span className="text-amber-300 font-mono text-xs">{selectedModel}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Language</span>
              <span className="text-amber-300 font-mono text-xs capitalize">{language}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Generations */}
      {jobs.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-amber-100 uppercase tracking-wider">Recent Generations</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {jobs.map((job) => (
              <div key={job.id} className="rounded-lg border border-slate-800 bg-slate-900/50 overflow-hidden group">
                <div className="aspect-[9/16] bg-black relative">
                  {job.mediaType === "video" ? (
                    <video src={job.url} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-700">
                      <Film size={24} />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button className="p-2 rounded-full bg-white/10 text-white hover:bg-white/20">
                      <Play size={16} />
                    </button>
                  </div>
                </div>
                <div className="p-2">
                  <p className="text-xs text-slate-400 truncate">{job.title}</p>
                  <p className="text-[10px] text-slate-600">{new Date(job.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
