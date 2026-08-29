"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Play,
  Plus,
  RefreshCcw,
  Send,
  Trash2,
  X
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";

const NETWORKS = ["instagram", "facebook", "youtube", "tiktok", "linkedin", "website", "x", "reddit"] as const;
const STATUSES = ["draft", "pending", "approved", "published", "failed"] as const;
const FORMATS = ["blog", "image", "podcast", "ugc", "newsroom", "direct", "cinematic"] as const;
type Status = (typeof STATUSES)[number];
type Format = (typeof FORMATS)[number];

type Post = {
  id: string;
  title: string;
  network: string;
  scheduledAt: string;
  status: Status;
  autoPost: boolean;
  caption: string;
  contentType: Format;
  videoJobId?: string | null;
  upperJobId?: string | null;
  lowerJobId?: string | null;
  mediaUrl?: string | null;
  mediaType?: string | null;
  planningHorizonDays?: number | null;
  publishedAt?: string | null;
  verifiedAt?: string | null;
  instagramPermalink?: string | null;
  youtubeVideoId?: string | null;
  youtubeError?: string | null;
  verificationError?: string | null;
  error?: string | null;
  redditSubreddit?: string | null;
  contentBody?: string | null;
  seoTitle?: string | null;
  metaDescription?: string | null;
  slug?: string | null;
  focusKeyword?: string | null;
  generationStatus?: string | null;
  siteId?: string | null;
  campaignId?: string | null;
};

function startOfWeek(input: Date) {
  const d = new Date(input);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  d.setHours(0, 0, 0, 0);
  return d;
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function localInputValue(iso?: string) {
  const d = iso ? new Date(iso) : new Date(Date.now() + 3600000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function canPublish(post: Post) {
  if (post.network === "instagram") return Boolean(
    (!post.generationStatus || post.generationStatus === "ready") &&
    (post.mediaUrl || post.videoJobId)
  );
  if (post.network === "website") {
    return Boolean(
      post.siteId &&
      (!post.generationStatus || post.generationStatus === "ready") &&
      post.contentBody?.trim()
    );
  }
  if (post.network === "youtube") {
    return Boolean(
      (!post.generationStatus || post.generationStatus === "ready") &&
      post.mediaUrl &&
      /^video\//.test(String(post.mediaType || ""))
    );
  }
  if (post.network === "x" || post.network === "linkedin") {
    return Boolean(post.caption?.trim());
  }
  if (post.network === "reddit") {
    return Boolean(post.caption?.trim() && post.redditSubreddit?.trim());
  }
  return false;
}

export default function CalendarPage() {
  return (
    <AuthGuard>
      <AppShell>
        <Suspense fallback={null}>
          <CalendarInner />
        </Suspense>
      </AppShell>
    </AuthGuard>
  );
}

function CalendarInner() {
  const search = useSearchParams();
  const showFeatureDisabled = search.get("feature_disabled") === "image_generation";
  const [posts, setPosts] = useState<Post[]>([]);
  const [week, setWeek] = useState(() => startOfWeek(new Date()));
  const [editing, setEditing] = useState<Post | null | "new">(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/calendar", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setPosts(d.posts || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(week, i)), [week]);

  async function patch(post: Post, body: Record<string, unknown>) {
    setBusy(post.id);
    setError(null);
    try {
      const r = await fetch(`/api/calendar/${post.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function save(value: Record<string, unknown>) {
    const isNew = editing === "new";
    const r = await fetch(isNew ? "/api/calendar" : `/api/calendar/${(editing as Post).id}`, {
      method: isNew ? "POST" : "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...value, scheduledAt: new Date(String(value.scheduledAt)).toISOString() })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
    setEditing(null);
    await load();
  }

  async function remove(post: Post) {
    if (!confirm(`Delete “${post.title}”?`)) return;
    const r = await fetch(`/api/calendar/${post.id}`, { method: "DELETE" });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setError(d.error || `HTTP ${r.status}`);
      return;
    }
    await load();
  }

  async function publish(post: Post) {
    setBusy(`${post.id}:publish`);
    setError(null);
    try {
      const r = await fetch(`/api/calendar/${post.id}/publish`, { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function autoApproveAll() {
    setBusy("auto-approve");
    try {
      const r = await fetch("/api/calendar/auto-approve", { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setError(null);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  }
  async function spreadCalendar() {
    if (!window.confirm("Spread every unpublished calendar item evenly across the next 60 days? This does not delete or regenerate media.")) return;
    setBusy("spread-calendar");
    try {
      const r = await fetch("/api/calendar/spread", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ horizonDays: 60 }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || ("HTTP " + r.status));
      setError(null);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  }

  async function clearCalendar() {
    if (!window.confirm("Delete EVERY item on the calendar? This cannot be undone.")) return;
    setBusy("clear-calendar");
    try {
      const r = await fetch("/api/calendar/clear", { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setError(null);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  }
  async function bulkApproveAll() {
    setBusy("bulk-approve");
    try {
      const r = await fetch("/api/calendar/bulk-approve", { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  }
  async function scrubCaptions() {
    if (!window.confirm("Walk every scheduled post and rewrite any operator-language captions? Existing good captions are left alone.")) return;
    setBusy("scrub");
    try {
      const r = await fetch("/api/admin/calendar/scrub-captions", { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      alert(`Scrubbed ${d.fixed} of ${d.scanned} captions.`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  }
  async function rebuildVideos() {
    if (!window.confirm("Detach all old compositions and requeue every future campaign video? This will take a few minutes.")) return;
    setBusy("rebuild");
    try {
      const r = await fetch("/api/admin/calendar/rebuild-videos", { method: "POST", headers: {"content-type":"application/json"}, body: JSON.stringify({}) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      alert(`Rebuild queued: ${d.queued || 0} videos will be regenerated.`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  }
  async function rearmPending() {
    setBusy("rearm");
    try {
      const r = await fetch("/api/admin/campaigns/rearm-pending", { method: "POST", headers: {"content-type":"application/json"}, body: JSON.stringify({}) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  }
  async function runAutopilot() {
    setBusy("autopilot");
    try {
      const r = await fetch("/api/internal/campaign-autopilot", { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  }
  async function retryGeneration(post: Post) {
    setBusy(`${post.id}:retry`);
    setError(null);
    try {
      const r = await fetch(`/api/calendar/${post.id}/retry-generation`, { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <main>
      <PageHeader
        eyebrow="Publishing workflow"
        eyebrowIcon={<CalendarDays size={16}/>}
        title="Content Calendar"
        description="Generated blog articles, images and videos land here automatically. Review and edit them, approve them, publish immediately, or enable auto-post for connected Instagram and Website publishers. Planning supports 3, 7, 14 or 30 days."
        actions={<>
          <Button variant="secondary" onClick={runAutopilot} disabled={busy === "autopilot"}>{busy === "autopilot" ? "Running…" : <><Play size={14} className="mr-2"/>Run autopilot</>}</Button>
          <Button variant="secondary" onClick={rearmPending} disabled={busy === "rearm"}>{busy === "rearm" ? "Rearming…" : "Rearm pending"}</Button>
          <Button variant="secondary" onClick={bulkApproveAll} disabled={busy === "bulk-approve"}>{busy === "bulk-approve" ? "Approving…" : "Bulk-approve"}</Button>
          <Button variant="secondary" onClick={autoApproveAll} disabled={busy === "auto-approve"}>{busy === "auto-approve" ? "Approving…" : "Auto-approve & auto-post"}</Button>
          <Button variant="secondary" onClick={scrubCaptions} disabled={busy === "scrub"}>{busy === "scrub" ? "Scrubbing…" : "Scrub captions"}</Button>
          <Button variant="secondary" onClick={spreadCalendar} disabled={busy === "spread-calendar"}>{busy === "spread-calendar" ? "Spacing…" : "Spread over 60 days"}</Button>
          <Button variant="secondary" className="border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100" onClick={rebuildVideos} disabled={busy === "rebuild"}>{busy === "rebuild" ? "Rebuilding…" : "Rebuild all videos"}</Button>
          <Button variant="secondary" className="border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100" onClick={clearCalendar} disabled={busy === "clear-calendar"}>{busy === "clear-calendar" ? "Clearing…" : <><Trash2 size={14} className="mr-2"/>Clear calendar</>}</Button>
          <Button variant="secondary" onClick={load} disabled={loading}><RefreshCcw size={14} className={`mr-2 ${loading ? "animate-spin" : ""}`}/>Refresh</Button>
          <Button onClick={() => setEditing("new")}><Plus size={14} className="mr-2"/>Add post</Button>
        </>}
      />

      {showFeatureDisabled && <div className="mb-4 rounded-xl border border-violet-200 bg-violet-50 p-3 text-sm text-violet-900">
        <strong>That page has moved.</strong> Calendar, Library, Claw and Settings cover it now.
      </div>}

      {error && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Stat label="Needs approval" value={posts.filter(p => p.status === "pending").length}/>
        <Stat label="Approved" value={posts.filter(p => p.status === "approved").length}/>
        <Stat label="Auto-post enabled" value={posts.filter(p => p.autoPost).length}/>
        <Stat label="Generated assets" value={posts.filter(p => p.mediaUrl || p.videoJobId || p.upperJobId || p.lowerJobId || p.contentBody).length}/>
      </div>

      <div className="mb-4 flex items-center justify-between rounded-2xl border bg-white p-3">
        <button className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-800 hover:bg-slate-200" onClick={() => setWeek(addDays(week, -7))} aria-label="Previous week"><ChevronLeft/></button>
        <div className="text-center">
          <div className="text-sm font-semibold">{week.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</div>
          <button className="rounded-md px-2 py-1 text-xs font-semibold text-violet-700 hover:bg-violet-50" onClick={() => setWeek(startOfWeek(new Date()))}>Today</button>
        </div>
        <button className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-800 hover:bg-slate-200" onClick={() => setWeek(addDays(week, 7))} aria-label="Next week"><ChevronRight/></button>
      </div>

      <div className="grid gap-3 lg:grid-cols-7">
        {days.map(day => {
          const items = posts.filter(p => new Date(p.scheduledAt).toDateString() === day.toDateString());
          return (
            <section key={day.toISOString()} className="min-h-44 rounded-2xl border bg-white p-3">
              <div className="mb-3 flex justify-between">
                <div><div className="text-[10px] uppercase text-slate-500">{day.toLocaleDateString(undefined, { weekday: "short" })}</div><div className="text-xl font-semibold">{day.getDate()}</div></div>
                <button className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-slate-800 hover:bg-slate-200" onClick={() => setEditing("new")} aria-label={`Add post ${day.toDateString()}`}><Plus size={14}/></button>
              </div>
              <div className="grid gap-2">
                {items.map(post => <button key={post.id} onClick={() => setEditing(post)} className="rounded-xl border bg-slate-50 p-2 text-left text-slate-800 hover:border-violet-300"><div className="text-xs font-semibold">{post.title}</div><div className="mt-1 text-[10px] font-semibold uppercase text-violet-700">{post.contentType} · {post.network}</div><div className="flex items-center gap-1 text-[10px] text-slate-600">{post.status === "published" && <span aria-label={post.verifiedAt ? "Verified live on Instagram" : "Awaiting verification"} className={`inline-block h-2 w-2 rounded-full ${post.verifiedAt ? "bg-emerald-500" : "bg-amber-400"}`}/>}<span>{post.status}{post.autoPost ? " · auto" : ""}{post.generationStatus ? ` · ${post.generationStatus}` : ""}</span></div></button>)}
              </div>
            </section>
          );
        })}
      </div>

      <div className="mt-6 rounded-2xl border bg-white p-4">
        <div className="mb-3 font-semibold">Owner review queue</div>
        <div className="grid gap-3">
          {posts.filter(p => p.status !== "published").map(post => {
            const publishable = canPublish(post);
            const autoCapable = post.network === "instagram" || post.network === "website" || post.network === "youtube" || post.network === "x" || post.network === "linkedin";
            const generating = post.generationStatus === "pending" || post.generationStatus === "generating";
            const retryable = Boolean(post.campaignId) && (post.generationStatus === "failed" || post.generationStatus === "pending_manual");
            return (
              <article key={post.id} className="rounded-xl border p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <button className="text-left text-slate-900" onClick={() => setEditing(post)}>
                      <div className="font-medium">{post.title}</div>
                      <div className="text-xs text-slate-500">{post.contentType} · {post.network} · {new Date(post.scheduledAt).toLocaleString()}</div>
                      <div className="mt-1 text-[11px] text-slate-500">Generation: {post.generationStatus || "ready"}</div>
                    </button>
                    {post.error && <div className="mt-1 text-xs text-rose-700">{post.error}</div>}
                  </div>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase text-slate-700">{post.status}</span>
                  <div className="flex min-w-0 flex-wrap gap-2">
                    {post.status === "pending" && <Button size="sm" onClick={() => patch(post, { status: "approved" })} disabled={busy === post.id || generating}><Check size={13} className="mr-1"/>Approve</Button>}
                    {retryable && <Button size="sm" variant="secondary" onClick={() => retryGeneration(post)} disabled={busy === `${post.id}:retry`}><RefreshCcw size={13} className="mr-1"/>{busy === `${post.id}:retry` ? "Retrying…" : "Retry generation"}</Button>}
                    <Button size="sm" variant="secondary" onClick={() => patch(post, { autoPost: !post.autoPost, status: post.status === "pending" ? "approved" : post.status })} disabled={!autoCapable || busy === post.id || generating || (post.network === "website" && !post.contentBody?.trim())}>{post.autoPost ? "Disable auto" : "Enable auto"}</Button>
                    {publishable && <Button size="sm" variant="secondary" onClick={() => publish(post)} disabled={busy === `${post.id}:publish`}><Send size={13} className="mr-1"/>{busy === `${post.id}:publish` ? "Posting…" : "Post now"}</Button>}
                    {!publishable && post.network === "instagram" && <Button size="sm" variant="secondary" disabled title="Post now unlocks when the video finishes generating"><Send size={13} className="mr-1"/>{generating ? "Post now (generating…)" : "Post now (no media yet)"}</Button>}
                    <button onClick={() => remove(post)} aria-label={`Delete ${post.title}`} className="grid h-9 w-9 place-items-center rounded-lg border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"><Trash2 size={14}/></button>
                  </div>
                </div>
                {post.mediaUrl && <div className="mt-3">{String(post.mediaType || "").startsWith("video/") ? <video src={post.mediaUrl} controls className="max-h-52 rounded-lg bg-black"/> : <img src={post.mediaUrl} alt={`${post.title} attachment`} className="max-h-52 rounded-lg object-contain"/>}</div>}
                {(post.videoJobId || post.upperJobId || post.lowerJobId) && !post.mediaUrl && generating && <div className="mt-2 text-xs text-slate-500"><Play size={11} className="inline"/> {post.contentType==="podcast"?"Two-lane generation in progress":"Video generation in progress"}</div>}
                {post.contentBody && <div className="mt-3 max-h-32 overflow-hidden whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-xs text-slate-600">{post.contentBody.slice(0, 700)}{post.contentBody.length > 700 ? "…" : ""}</div>}
              </article>
            );
          })}
        </div>
      </div>

      <div className="mt-6 rounded-2xl border bg-white p-4">
        <div className="mb-3 flex items-center gap-2 font-semibold">Published <span className="text-xs font-normal text-slate-500">green light = confirmed live on the destination</span></div>
        <div className="grid gap-2">
          {posts.filter(p => p.status === "published").map(post => (
            <article key={post.id} className="flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center">
              <span aria-label={post.verifiedAt ? "Verified live" : "Awaiting verification"} className={`inline-block h-3 w-3 shrink-0 rounded-full ${post.verifiedAt ? "bg-emerald-500" : "bg-amber-400"}`}/>
              <div className="min-w-0 flex-1">
                <div className="font-medium text-slate-900">{post.title}</div>
                <div className="text-xs text-slate-500">{post.network} · published {post.publishedAt ? new Date(post.publishedAt).toLocaleString() : ""}{post.verifiedAt ? ` · verified ${new Date(post.verifiedAt).toLocaleString()}` : " · verifying…"}</div>
                {post.youtubeVideoId && <div className="mt-1 text-[11px] text-emerald-700">YouTube video id: {post.youtubeVideoId}</div>}
                {post.youtubeError && <div className="mt-1 text-[11px] text-rose-700">YouTube error: {post.youtubeError}</div>}
                {!post.verifiedAt && post.verificationError && <div className="text-[11px] text-amber-700">{post.verificationError}</div>}
              </div>
              {post.instagramPermalink && <a href={post.instagramPermalink} target="_blank" rel="noreferrer" className="text-xs font-semibold text-violet-700 hover:underline">View on Instagram</a>}
              {post.youtubeVideoId && <a href={`https://youtu.be/${post.youtubeVideoId}`} target="_blank" rel="noreferrer" className="text-xs font-semibold text-rose-700 hover:underline">View on YouTube</a>}
            </article>
          ))}
          {posts.every(p => p.status !== "published") && <div className="text-sm text-slate-500">Nothing published yet.</div>}
        </div>
      </div>
      {editing && <PostModal post={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSave={save}/>}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl border bg-white p-4"><div className="text-2xl font-semibold">{value}</div><div className="text-xs text-slate-500">{label}</div></div>;
}

function PostModal({ post, onClose, onSave }: { post: Post | null; onClose: () => void; onSave: (v: Record<string, unknown>) => Promise<void> }) {
  const [title, setTitle] = useState(post?.title || "");
  const [network, setNetwork] = useState(post?.network || "instagram");
  const [scheduledAt, setScheduledAt] = useState(localInputValue(post?.scheduledAt));
  const [status, setStatus] = useState<Status>(post?.status || "pending");
  const [contentType, setContentType] = useState<Format>(post?.contentType || "blog");
  const [autoPost, setAutoPost] = useState(Boolean(post?.autoPost));
  const [caption, setCaption] = useState(post?.caption || "");
  const [contentBody, setContentBody] = useState(post?.contentBody || "");
  const [seoTitle, setSeoTitle] = useState(post?.seoTitle || "");
  const [metaDescription, setMetaDescription] = useState(post?.metaDescription || "");
  const [slug, setSlug] = useState(post?.slug || "");
  const [focusKeyword, setFocusKeyword] = useState(post?.focusKeyword || "");
  const [redditSubreddit, setRedditSubreddit] = useState(post?.redditSubreddit || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoCapable = network === "instagram" || network === "website" || network === "youtube" || network === "x" || network === "linkedin";
  const isBlog = contentType === "blog" || Boolean(contentBody);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSave({
        title,
        network,
        scheduledAt,
        status,
        autoPost: autoCapable ? autoPost : false,
        caption,
        contentBody,
        seoTitle,
        metaDescription,
        slug,
        focusKeyword,
        contentType,
        mediaUrl: post?.mediaUrl,
        mediaType: post?.mediaType,
        siteId: post?.siteId,
        redditSubreddit: network === "reddit" ? redditSubreddit : undefined
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/35 p-4">
      <div className="flex min-h-full items-start justify-center py-4 sm:items-center">
        <form onSubmit={submit} className="w-full max-w-3xl rounded-2xl bg-white p-5 shadow-xl">
          <div className="mb-4 flex justify-between"><div><strong>{post ? "Review scheduled post" : "Schedule content"}</strong>{post?.generationStatus && <div className="mt-1 text-xs text-slate-500">Generation status: {post.generationStatus}</div>}</div><button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-800 hover:bg-slate-200"><X size={16}/></button></div>
          <div className="grid gap-3">
            <label>Title<input required value={title} onChange={e => setTitle(e.target.value)} className="mt-1 h-11 w-full rounded-xl border px-3"/></label>
            <div className="grid grid-cols-2 gap-3">
              <label>Format<select value={contentType} onChange={e => setContentType(e.target.value as Format)} className="mt-1 h-11 w-full rounded-xl border px-3">{FORMATS.map(x => <option key={x}>{x}</option>)}</select></label>
              <label>Network<select value={network} onChange={e => setNetwork(e.target.value)} className="mt-1 h-11 w-full rounded-xl border px-3">{NETWORKS.map(x => <option key={x}>{x}</option>)}</select></label>
            </div>
            <label>Status<select value={status} onChange={e => setStatus(e.target.value as Status)} className="mt-1 h-11 w-full rounded-xl border px-3">{STATUSES.map(x => <option key={x}>{x}</option>)}</select></label>
            <label>Date & time<input type="datetime-local" required value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} className="mt-1 h-11 w-full rounded-xl border px-3"/></label>
            <label>Caption / excerpt / review notes{network === "x" && <span className={`ml-2 text-xs ${caption.length > 280 ? "text-rose-600" : "text-slate-400"}`}>{caption.length}/280</span>}<textarea rows={3} value={caption} onChange={e => setCaption(e.target.value)} className="mt-1 w-full rounded-xl border p-3"/></label>

            {network === "reddit" && <>
              <label>Target subreddit<input value={redditSubreddit} onChange={e => setRedditSubreddit(e.target.value.replace(/^r\//, ""))} placeholder="e.g. smallbusiness (without r/)" className="mt-1 h-11 w-full rounded-xl border px-3"/></label>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Reddit always requires a manual Publish click — subreddit self-promotion rules are enforced by human moderators per-community and can't be verified automatically. Check the target subreddit's rules before publishing.</div>
            </>}

            {isBlog && <>
              <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-xs text-violet-900">Full SEO article review. Edits saved here are the exact content used by the Website publisher.</div>
              <div className="grid gap-3 md:grid-cols-2">
                <label>SEO title<input value={seoTitle} onChange={e => setSeoTitle(e.target.value)} className="mt-1 h-11 w-full rounded-xl border px-3" maxLength={180}/></label>
                <label>Focus keyword<input value={focusKeyword} onChange={e => setFocusKeyword(e.target.value)} className="mt-1 h-11 w-full rounded-xl border px-3"/></label>
                <label>Slug<input value={slug} onChange={e => setSlug(e.target.value)} className="mt-1 h-11 w-full rounded-xl border px-3"/></label>
                <label className="md:col-span-2">Meta description<textarea rows={2} value={metaDescription} onChange={e => setMetaDescription(e.target.value)} className="mt-1 w-full rounded-xl border p-3"/></label>
              </div>
              <label>Article body<textarea rows={16} value={contentBody} onChange={e => setContentBody(e.target.value)} className="mt-1 w-full rounded-xl border p-3 font-mono text-xs"/></label>
            </>}

            <label className={`flex gap-3 rounded-xl border p-3 ${!autoCapable ? "opacity-55" : ""}`}>
              <input type="checkbox" checked={autoPost} disabled={!autoCapable} onChange={e => setAutoPost(e.target.checked)}/>
              <span><strong>Auto-post when approved and due</strong><br/><span className="text-xs text-slate-500">Instagram uses Composio. Website uses the server-side publishing connection configured under Sites.</span></span>
            </label>
            {post?.mediaUrl && <div className="rounded-xl bg-slate-50 p-2 text-xs"><ImageIcon size={12} className="mr-1 inline"/>Generated media attached</div>}
            {error && <div className="text-sm text-rose-700">{error}</div>}
          </div>
          <div className="mt-5 flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy || !title.trim()}>{busy ? "Saving…" : "Save"}</Button></div>
        </form>
      </div>
    </div>
  );
}
