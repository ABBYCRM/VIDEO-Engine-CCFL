"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, RefreshCcw, Trash2, X } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { Button } from "@/components/ui/button";

const NETWORKS = ["instagram", "facebook", "youtube", "tiktok", "linkedin"] as const;
const STATUSES = ["draft", "pending", "approved", "published", "failed"] as const;
type Status = (typeof STATUSES)[number];
type Post = {
  id: string;
  title: string;
  network: string;
  scheduledAt: string;
  status: Status;
  autoPost: boolean;
  caption: string;
};

function startOfWeek(input: Date) {
  const d = new Date(input);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function localInputValue(iso?: string) {
  const d = iso ? new Date(iso) : new Date(Date.now() + 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function CalendarPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [week, setWeek] = useState(() => startOfWeek(new Date()));
  const [editing, setEditing] = useState<Post | null | "new">(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch("/api/calendar", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setPosts(d.posts || []);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(week, i)), [week]);

  async function save(values: { title: string; network: string; scheduledAt: string; status: Status; autoPost: boolean; caption: string }) {
    const isNew = editing === "new";
    const r = await fetch(isNew ? "/api/calendar" : `/api/calendar/${(editing as Post).id}`, {
      method: isNew ? "POST" : "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...values, scheduledAt: new Date(values.scheduledAt).toISOString() })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
    setEditing(null);
    await load();
  }

  async function remove(post: Post) {
    if (!confirm(`Delete “${post.title}”?`)) return;
    const r = await fetch(`/api/calendar/${post.id}`, { method: "DELETE" });
    if (!r.ok) { const d = await r.json().catch(() => ({})); setError(d.error || `HTTP ${r.status}`); return; }
    await load();
  }

  return (
    <AuthGuard>
      <AppShell>
        <main>
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-violet-700"><CalendarDays size={16}/> Publishing workflow</div>
              <h1 className="text-[34px] font-semibold leading-tight tracking-tight text-slate-900">Content Calendar</h1>
              <p className="mt-1 max-w-3xl text-sm text-slate-600">Real schedule records stored in the app database. Create, edit, approve, enable auto-post, move dates, or remove posts.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={load} disabled={loading}><RefreshCcw size={14} className={`mr-2 ${loading ? "animate-spin" : ""}`}/>Refresh</Button>
              <Button onClick={() => setEditing("new")}><Plus size={14} className="mr-2"/>Add post</Button>
            </div>
          </div>

          {error && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

          <div className="mb-4 flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-3">
            <button className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 hover:bg-slate-50" onClick={() => setWeek(addDays(week, -7))} aria-label="Previous week"><ChevronLeft size={18}/></button>
            <div className="text-center">
              <div className="text-sm font-semibold text-slate-900">{week.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</div>
              <button className="text-xs text-violet-700 hover:underline" onClick={() => setWeek(startOfWeek(new Date()))}>Today</button>
            </div>
            <button className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 hover:bg-slate-50" onClick={() => setWeek(addDays(week, 7))} aria-label="Next week"><ChevronRight size={18}/></button>
          </div>

          <div className="grid gap-3 lg:grid-cols-7">
            {days.map(day => {
              const same = (iso: string) => {
                const d = new Date(iso);
                return d.getFullYear() === day.getFullYear() && d.getMonth() === day.getMonth() && d.getDate() === day.getDate();
              };
              const items = posts.filter(p => same(p.scheduledAt));
              const today = day.toDateString() === new Date().toDateString();
              return <section key={day.toISOString()} className={`min-h-44 rounded-2xl border p-3 ${today ? "border-violet-300 bg-violet-50/40" : "border-slate-200 bg-white"}`}>
                <div className="mb-3 flex items-center justify-between">
                  <div><div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{day.toLocaleDateString(undefined,{weekday:"short"})}</div><div className="text-xl font-semibold text-slate-900">{day.getDate()}</div></div>
                  <button className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" onClick={() => setEditing("new")} aria-label={`Add post ${day.toDateString()}`}><Plus size={14}/></button>
                </div>
                <div className="grid gap-2">
                  {items.map(post => <button key={post.id} onClick={() => setEditing(post)} className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-left hover:border-violet-300 hover:bg-violet-50">
                    <div className="line-clamp-2 text-xs font-semibold text-slate-900">{post.title}</div>
                    <div className="mt-1 flex items-center justify-between gap-1 text-[10px] text-slate-500"><span>{new Date(post.scheduledAt).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})}</span><span className="uppercase">{post.network}</span></div>
                    <div className="mt-1 text-[10px] font-medium uppercase tracking-wide text-violet-700">{post.status}{post.autoPost ? " · auto" : ""}</div>
                  </button>)}
                  {!items.length && <div className="rounded-xl border border-dashed border-slate-200 p-3 text-center text-[11px] text-slate-400">No posts</div>}
                </div>
              </section>;
            })}
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-3 text-sm font-semibold text-slate-900">Upcoming queue</div>
            <div className="grid gap-2">
              {posts.filter(p => new Date(p.scheduledAt).getTime() >= Date.now()).slice(0, 20).map(post => <div key={post.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 px-3 py-2">
                <button className="min-w-0 flex-1 text-left" onClick={() => setEditing(post)}><div className="truncate text-sm font-medium text-slate-900">{post.title}</div><div className="text-xs text-slate-500">{new Date(post.scheduledAt).toLocaleString()} · {post.network}</div></button>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase text-slate-700">{post.status}</span>
                <button className="grid h-9 w-9 place-items-center rounded-lg text-rose-500 hover:bg-rose-50" onClick={() => remove(post)} aria-label={`Delete ${post.title}`}><Trash2 size={14}/></button>
              </div>)}
              {!posts.length && !loading && <div className="py-6 text-center text-sm text-slate-500">Nothing scheduled yet. Add the first post.</div>}
            </div>
          </div>
        </main>

        {editing && <PostModal post={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSave={save}/>} 
      </AppShell>
    </AuthGuard>
  );
}

function PostModal({ post, onClose, onSave }: { post: Post | null; onClose: () => void; onSave: (v: { title: string; network: string; scheduledAt: string; status: Status; autoPost: boolean; caption: string }) => Promise<void> }) {
  const [title,setTitle]=useState(post?.title || "");
  const [network,setNetwork]=useState(post?.network || "instagram");
  const [scheduledAt,setScheduledAt]=useState(localInputValue(post?.scheduledAt));
  const [status,setStatus]=useState<Status>(post?.status || "draft");
  const [autoPost,setAutoPost]=useState(Boolean(post?.autoPost));
  const [caption,setCaption]=useState(post?.caption || "");
  const [busy,setBusy]=useState(false); const [error,setError]=useState<string|null>(null);
  async function submit(e: React.FormEvent) { e.preventDefault(); setBusy(true); setError(null); try { await onSave({title,network,scheduledAt,status,autoPost,caption}); } catch(e){setError(e instanceof Error?e.message:String(e));} finally{setBusy(false);} }
  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/35 p-4" onMouseDown={e => { if(e.target===e.currentTarget) onClose(); }}>
    <form onSubmit={submit} className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
      <div className="mb-4 flex items-center justify-between"><div className="font-semibold text-slate-900">{post?"Edit scheduled post":"Schedule a post"}</div><button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-slate-100" aria-label="Close"><X size={16}/></button></div>
      <div className="grid gap-4">
        <label className="grid gap-1 text-sm"><span className="font-medium text-slate-700">Title</span><input required maxLength={180} value={title} onChange={e=>setTitle(e.target.value)} className="h-11 rounded-xl border border-slate-200 px-3"/></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm"><span className="font-medium text-slate-700">Network</span><select value={network} onChange={e=>setNetwork(e.target.value)} className="h-11 rounded-xl border border-slate-200 px-3">{NETWORKS.map(n=><option key={n} value={n}>{n}</option>)}</select></label>
          <label className="grid gap-1 text-sm"><span className="font-medium text-slate-700">Status</span><select value={status} onChange={e=>setStatus(e.target.value as Status)} className="h-11 rounded-xl border border-slate-200 px-3">{STATUSES.map(s=><option key={s} value={s}>{s}</option>)}</select></label>
        </div>
        <label className="grid gap-1 text-sm"><span className="font-medium text-slate-700">Scheduled date & time</span><input required type="datetime-local" value={scheduledAt} onChange={e=>setScheduledAt(e.target.value)} className="h-11 rounded-xl border border-slate-200 px-3"/></label>
        <label className="grid gap-1 text-sm"><span className="font-medium text-slate-700">Caption / operator notes</span><textarea rows={4} maxLength={5000} value={caption} onChange={e=>setCaption(e.target.value)} className="rounded-xl border border-slate-200 p-3"/></label>
        <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm"><input type="checkbox" checked={autoPost} onChange={e=>setAutoPost(e.target.checked)} className="h-4 w-4"/><span><strong>Auto-post when approved</strong><br/><span className="text-xs text-slate-500">Publishing worker can use the connected Composio account when one is attached.</span></span></label>
        {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-2 text-sm text-rose-700">{error}</div>}
      </div>
      <div className="mt-5 flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy || !title.trim()}>{busy?"Saving…":"Save schedule"}</Button></div>
    </form>
  </div>;
}
