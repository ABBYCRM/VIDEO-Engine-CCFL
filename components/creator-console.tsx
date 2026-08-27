"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar as CalendarIcon,
  Clock,
  FileVideo2,
  Loader2,
  RefreshCcw,
  Save,
  Sparkles,
  Trash2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Format = "reel" | "story" | "post";

type Topic = {
  id: string;
  label: string;
  category: string;
};

const TOPICS: Topic[] = [
  { id: "car_accident", label: "Car accident", category: "car_accident" },
  { id: "rear_end", label: "Rear-end collision", category: "car_accident" },
  { id: "head_on", label: "Head-on collision", category: "car_accident" },
  { id: "rideshare", label: "Uber / Lyft accident", category: "rideshare" },
  { id: "trucking", label: "Trucking / 18-wheeler", category: "trucking" },
  { id: "truck_underride", label: "Truck underride", category: "trucking" },
  { id: "motorcycle", label: "Motorcycle accident", category: "car_accident" },
  { id: "pedestrian", label: "Pedestrian hit", category: "pedestrian" },
  { id: "bicycle", label: "Bicycle accident", category: "pedestrian" },
  { id: "slip_fall", label: "Slip & fall", category: "slip_fall" },
  { id: "wet_floor", label: "Wet floor / unmarked hazard", category: "slip_fall" },
  { id: "uneven_sidewalk", label: "Uneven sidewalk", category: "slip_fall" },
  { id: "workplace", label: "Workplace injury", category: "workplace" },
  { id: "construction", label: "Construction site", category: "workplace" },
  { id: "scaffolding", label: "Scaffolding fall", category: "workplace" },
  { id: "dog_bite", label: "Dog bite", category: "ugc" },
  { id: "wrongful_death", label: "Wrongful death", category: "ugc" },
  { id: "brain_injury", label: "Traumatic brain injury", category: "ugc" },
  { id: "spinal", label: "Spinal cord injury", category: "ugc" },
  { id: "free_case_review", label: "Free case review (CTA)", category: "ugc" },
  { id: "custom", label: "Custom — write your own", category: "custom" }
];

const TIME_SLOTS: string[] = [
  "06:00","07:00","08:00","09:00","10:00","11:00",
  "12:00","13:00","14:00","15:00","16:00","17:00",
  "18:00","19:00","20:00","21:00"
];

const NETWORK_OPTIONS: Array<{ id: string; label: string; emoji: string }> = [
  { id: "instagram", label: "Instagram", emoji: "📷" },
  { id: "tiktok", label: "TikTok", emoji: "🎵" },
  { id: "youtube", label: "YouTube Shorts", emoji: "▶️" },
  { id: "facebook", label: "Facebook", emoji: "📘" }
];

function todayIsoDate(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}
function defaultTime(): string {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return `${String(d.getHours()).padStart(2, "0")}:00`;
}
function combineDateAndTime(dateStr: string, timeStr: string): string {
  if (!dateStr || !timeStr) return new Date().toISOString();
  // dateStr: YYYY-MM-DD, timeStr: HH:MM
  const iso = new Date(`${dateStr}T${timeStr}:00`).toISOString();
  return iso;
}

type CreatorPost = {
  id: string;
  title: string;
  network: string;
  scheduled_at: string;
  status: string;
  auto_post: number | boolean;
  caption: string;
  content_type: string;
  media_url: string | null;
  media_type: string | null;
  source_asset_key: string | null;
  category: string | null;
  created_at: string;
};

export function CreatorConsole() {
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [label, setLabel] = useState("Creator upload");
  const [formats, setFormats] = useState<Format[]>(["reel", "story"]);
  const [date, setDate] = useState<string>(todayIsoDate());
  const [time, setTime] = useState<string>(defaultTime());
  const [network, setNetwork] = useState<string>("instagram");
  const [autoPost, setAutoPost] = useState(true);
  const [topicId, setTopicId] = useState<string>("car_accident");
  const [subject, setSubject] = useState<string>("");
  const [category, setCategory] = useState<string>("car_accident");
  const [caption, setCaption] = useState<string>("");
  const [generating, setGenerating] = useState(false);
  const [captionSource, setCaptionSource] = useState<"nvidia" | "fallback" | "user" | "">("");
  const [captionError, setCaptionError] = useState<string | null>(null);

  const [posts, setPosts] = useState<CreatorPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; ids?: string[]; error?: string; message?: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Keep category in sync with topic (most topics map 1:1)
  useEffect(() => {
    const t = TOPICS.find(t => t.id === topicId);
    if (t) setCategory(t.category);
  }, [topicId]);

  const loadPosts = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/creator/posts", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setPosts(d.posts || []);
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { loadPosts(); }, [loadPosts]);

  function pickFile() { fileInputRef.current?.click(); }
  function replaceFile() {
    // Clear input so picking the same filename re-triggers onChange on mobile
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setFile(null);
    if (filePreview) {
      URL.revokeObjectURL(filePreview);
      setFilePreview(null);
    }
    pickFile();
  }
  function clearFile() {
    if (fileInputRef.current) fileInputRef.current.value = "";
    setFile(null);
    if (filePreview) {
      URL.revokeObjectURL(filePreview);
      setFilePreview(null);
    }
  }
  function onFileChosen(f: File | null) {
    setFile(f);
    if (f) {
      if (filePreview) URL.revokeObjectURL(filePreview);
      const url = URL.createObjectURL(f);
      setFilePreview(url);
      if (!title) setTitle(f.name.replace(/\.[a-z0-9]+$/i, ""));
    } else {
      if (filePreview) URL.revokeObjectURL(filePreview);
      setFilePreview(null);
    }
  }
  function toggleFormat(f: Format) {
    setFormats(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]);
  }

  async function generateCaption() {
    if (!subject.trim()) {
      setCaptionError("Pick a topic and write a subject first.");
      return;
    }
    setGenerating(true);
    setCaptionError(null);
    try {
      const r = await fetch("/api/creator/caption", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subject, category, format: formats[0] || "reel", topic: TOPICS.find(t => t.id === topicId)?.label })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setCaption(d.caption);
      setCaptionSource(d.source || "nvidia");
    } catch (e) {
      setCaptionError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }

  async function uploadWithRetry(fd: FormData, attempt: number): Promise<any> {
    // Cold-start on DO basic-tier can take 15-20s, and Cloudflare's edge will
    // occasionally RST the connection during that window. If the fetch throws
    // a "Failed to fetch" TypeError once, we wait 3s and try again before
    // surfacing a real error.
    //
    // Note: keepalive: true is intentionally NOT used. Chrome silently drops
    // the body of multipart/form-data requests that include a File (from
    // <input type="file">) when keepalive is set — see the WHATWG fetch
    // spec and Chromium issue #1084001.
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 120_000);
    try {
      const r = await fetch("/api/creator/upload", {
        method: "POST",
        body: fd,
        signal: ac.signal
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      return d;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const isNetwork = /failed to fetch|networkerror|aborted|load failed|timeout/i.test(msg);
      if (isNetwork && attempt < 2) {
        // Try once more. The DO app may have been idle-evicted and the next
        // request will wake it. 3s gives the cold-start time to finish.
        // We rebuild a fresh FormData so the browser doesn't hand us a
        // partially-consumed one.
        setResult({ ok: false, error: "Connection dropped — retrying (server may be cold-starting)…" });
        await new Promise(r => setTimeout(r, 3000));
        return uploadWithRetry(fd, attempt + 1);
      }
      if (isNetwork) {
        throw new Error("Network connection dropped (the server may be cold-starting). Tap Upload + schedule again to retry.");
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  function buildFormData(): FormData {
    const fd = new FormData();
    if (file) {
      fd.append("file", file, file.name);
    }
    fd.append("title", title || (file ? file.name : ""));
    fd.append("label", label);
    fd.append("formats", formats.join(","));
    fd.append("scheduledAt", combineDateAndTime(date, time));
    fd.append("network", network);
    fd.append("autoPost", String(autoPost));
    fd.append("caption", caption);
    fd.append("category", category);
    fd.append("subject", subject);
    return fd;
  }

  async function upload() {
    setResult(null);
    if (!file) {
      setResult({ ok: false, error: "Pick a video first" });
      return;
    }
    if (formats.length === 0) {
      setResult({ ok: false, error: "Pick at least one format (reel, story, post)" });
      return;
    }
    if (!subject.trim()) {
      setResult({ ok: false, error: "Write a subject for the caption" });
      return;
    }
    if (!caption.trim()) {
      // Auto-generate if the operator forgot
      await generateCaption();
    }
    setBusy("upload");
    try {
      const d = await uploadWithRetry(buildFormData(), 1);
      setResult({ ok: true, ids: d.scheduledPostIds, message: `Scheduled ${d.scheduledPostIds?.length || 0} post(s) for ${d.formats?.join(", ")}` });
      // Reset only the per-upload bits; keep topic + date+time
      setFile(null);
      setFilePreview(null);
      setTitle("");
      loadPosts();
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  async function remove(ids: string[]) {
    if (!confirm(`Delete ${ids.length} scheduled post(s)? This removes the calendar entries${ids.length > 0 ? " and the backing video file" : ""}.`)) return;
    setBusy(`del:${ids.join(",")}`);
    try {
      const r = await fetch(`/api/creator/posts?ids=${ids.join(",")}`, { method: "DELETE" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setResult({ ok: true, message: `Removed ${d.deletedRows} post(s) and ${d.removedAssets} library asset(s).` });
      loadPosts();
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  const groupedByUpload = useMemo(() => {
    const map = new Map<string, CreatorPost[]>();
    for (const p of posts) {
      const key = p.source_asset_key || p.id;
      const list = map.get(key) || [];
      list.push(p);
      map.set(key, list);
    }
    return [...map.entries()].sort((a, b) => {
      const aMax = Math.max(...a[1].map(p => new Date(p.scheduled_at).getTime()));
      const bMax = Math.max(...b[1].map(p => new Date(p.scheduled_at).getTime()));
      return bMax - aMax;
    });
  }, [posts]);

  return (
    <div className="space-y-5">
      {/* Upload form */}
      <Card className="p-5">
        <div className="grid gap-4 md:grid-cols-2">
          {/* File picker + preview */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-slate-700">Video</label>
              <span className="text-[11px] text-slate-500">MP4 / WebM / MOV — up to 250MB</span>
            </div>
            <input ref={fileInputRef} type="file" accept="video/mp4,video/webm,video/quicktime,video/*" className="hidden" onChange={e => onFileChosen(e.target.files?.[0] || null)} />
            {filePreview ? (
              <>
                <button
                  type="button"
                  onClick={replaceFile}
                  className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-2xl border-2 border-slate-200 bg-black text-slate-500 hover:border-violet-300"
                  aria-label="Replace video"
                >
                  <video src={filePreview} controls className="h-full w-full object-cover" />
                </button>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] text-slate-500 truncate min-w-0">
                    {file?.name} · {file ? (file.size / 1024 / 1024).toFixed(1) : "0"} MB
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={replaceFile}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:border-violet-300 hover:text-violet-700"
                    >
                      <RefreshCcw size={12} />
                      Change video
                    </button>
                    <button
                      type="button"
                      onClick={clearFile}
                      className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2.5 py-1 text-[11px] font-medium text-red-600 hover:border-red-300 hover:bg-red-50"
                      aria-label="Remove video"
                    >
                      <Trash2 size={12} />
                      Remove
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={pickFile}
                  className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 text-slate-500 hover:border-violet-300 hover:bg-violet-50/40"
                >
                  <div className="flex flex-col items-center gap-2 text-xs">
                    <FileVideo2 size={32} className="text-slate-400" />
                    <span className="font-medium">Tap to pick a video</span>
                  </div>
                </button>
                <div className="text-[11px] text-slate-500 truncate">No video selected yet</div>
              </>
            )}
          </div>

          {/* Form fields */}
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <label className="text-sm font-medium text-slate-700">Title (operator-facing)</label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Rear-end on I-95 — Fender bender" />
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium text-slate-700">Label (internal)</label>
              <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Q4 batch — slot 1" />
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium text-slate-700">Format(s)</label>
              <div className="grid grid-cols-3 gap-2">
                {(["reel", "story", "post"] as Format[]).map(f => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => toggleFormat(f)}
                    aria-pressed={formats.includes(f)}
                    className={`rounded-xl border px-3 py-2 text-sm font-semibold capitalize transition ${formats.includes(f) ? "border-violet-500 bg-violet-50 text-violet-700 ring-2 ring-violet-200" : "border-slate-200 bg-white text-slate-600 hover:border-violet-200"}`}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-500">Pick all three if you want — same video published as Reel, Story, and Post on the same schedule.</p>
            </div>
          </div>
        </div>

        {/* Schedule row */}
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="grid gap-1.5">
            <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5"><CalendarIcon size={14}/> Date (calendar slot)</label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} min={todayIsoDate()} />
          </div>
          <div className="grid gap-1.5">
            <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5"><Clock size={14}/> Time (ET)</label>
            <select value={time} onChange={e => setTime(e.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm">
              {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="grid gap-1.5">
            <label className="text-sm font-medium text-slate-700">Network</label>
            <select value={network} onChange={e => setNetwork(e.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm">
              {NETWORK_OPTIONS.map(n => <option key={n.id} value={n.id}>{n.emoji} {n.label}</option>)}
            </select>
          </div>
        </div>

        {/* Subject row */}
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <div className="grid gap-1.5">
            <label className="text-sm font-medium text-slate-700">Topic (dropdown of every accident type)</label>
            <select value={topicId} onChange={e => setTopicId(e.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm">
              {TOPICS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <div className="grid gap-1.5">
            <label className="text-sm font-medium text-slate-700">Subject (write your own — drives the caption hook)</label>
            <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. T-bone on Biscayne Blvd — client was the passenger, not at fault" />
          </div>
        </div>

        {/* Auto-post toggle */}
        <label className="mt-4 flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={autoPost} onChange={e => setAutoPost(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500" />
          <span>Auto-publish at the scheduled time (turn off to keep the post in <code className="rounded bg-slate-100 px-1 text-[11px]">pending</code> for review)</span>
        </label>

        {/* Caption block */}
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-slate-700">Caption</label>
            <Button size="sm" variant="secondary" onClick={generateCaption} disabled={generating}>
              {generating ? <Loader2 size={14} className="mr-2 animate-spin"/> : <Sparkles size={14} className="mr-2"/>}
              Generate with NVIDIA
            </Button>
          </div>
          <textarea
            value={caption}
            onChange={e => { setCaption(e.target.value); setCaptionSource("user"); }}
            rows={6}
            placeholder="Write or generate. Will be enriched with CTA, phone, and hashtags before save."
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm leading-relaxed"
          />
          <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-500">
            <span>{caption.length} chars</span>
            {captionSource && (
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 uppercase tracking-wide">{captionSource === "nvidia" ? "AI · NVIDIA" : captionSource === "fallback" ? "fallback" : "manual"}</span>
            )}
            {captionError && <span className="text-rose-600">{captionError}</span>}
          </div>
        </div>

        {/* Result + save */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
          <div className="text-[12px] text-slate-600">
            Will publish at <b>{new Date(combineDateAndTime(date, time)).toLocaleString()}</b> as <b>{formats.length} post(s)</b> to <b>{network}</b>
            {autoPost ? " (auto-publish on)" : " (manual approve)"}
          </div>
          <Button size="lg" onClick={upload} disabled={busy === "upload"}>
            {busy === "upload" ? <Loader2 size={16} className="mr-2 animate-spin"/> : <Save size={16} className="mr-2"/>}
            Upload + schedule
          </Button>
        </div>

        {result && (
          <div className={`mt-3 rounded-xl border p-3 text-sm ${result.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
            {result.ok ? <><Check /> {result.message}</> : `Error: ${result.error}`}
          </div>
        )}
      </Card>

      {/* Schedule list */}
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Scheduled creator posts</h2>
            <p className="text-xs text-slate-500">Auto-published by the calendar publisher. Delete to unschedule.</p>
          </div>
          <Button variant="secondary" size="sm" onClick={loadPosts} disabled={loading}>
            <RefreshCcw size={14} className={`mr-2 ${loading ? "animate-spin" : ""}`}/>Refresh
          </Button>
        </div>

        {loading ? (
          <div className="text-sm text-slate-500">Loading…</div>
        ) : groupedByUpload.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            No creator uploads yet. Pick a video above to get started.
          </div>
        ) : (
          <div className="space-y-3">
            {groupedByUpload.map(([key, list]) => {
              const first = list[0];
              const allIds = list.map(p => p.id);
              const dt = new Date(first.scheduled_at);
              return (
                <div key={key} className="flex flex-col gap-3 rounded-2xl border bg-white p-4 sm:flex-row sm:items-start">
                  <div className="aspect-video w-full sm:w-40 overflow-hidden rounded-xl bg-slate-900">
                    {first.media_url ? (
                      <video src={first.media_url} controls className="h-full w-full object-cover" />
                    ) : (
                      <div className="grid h-full place-items-center text-slate-500"><FileVideo2 size={28} /></div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-slate-900 truncate">{first.title}</h3>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600">{first.content_type}</span>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {dt.toLocaleString()} · {first.network} · {list.map(p => p.content_type.replace("creator-", "")).join(" + ")}
                    </div>
                    {first.caption && (
                      <div className="mt-2 line-clamp-3 rounded-lg bg-slate-50 p-2 text-[12px] text-slate-600 whitespace-pre-wrap">{first.caption}</div>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                      <span className={`rounded-full px-2 py-0.5 font-semibold uppercase ${first.status === "published" ? "bg-emerald-100 text-emerald-700" : first.status === "pending" ? "bg-amber-100 text-amber-700" : first.status === "approved" ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-600"}`}>
                        {first.status}
                      </span>
                      <span className="text-slate-500">{first.auto_post ? "auto-publish on" : "manual"}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" variant="secondary" disabled={first.status === "published" || busy === `del:${allIds.join(",")}`} onClick={() => remove(allIds)}>
                      {busy === `del:${allIds.join(",")}` ? <Loader2 size={14} className="mr-1 animate-spin"/> : <Trash2 size={14} className="mr-1"/>}
                      Delete
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

function Check() {
  return <span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500 align-middle" />;
}
