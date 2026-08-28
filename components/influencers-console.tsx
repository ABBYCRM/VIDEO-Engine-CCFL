"use client";

import { useCallback, useEffect, useState } from "react";
import { Mail, Plus, RefreshCcw, Send, Trash2, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type Influencer = {
  id: string;
  handle: string;
  platform: string;
  profileUrl: string | null;
  followerCount: number | null;
  niche: string | null;
  contactEmail: string | null;
  status: "prospect" | "contacted" | "negotiating" | "active" | "declined";
  notes: string;
  source: string | null;
  discoveredAt: string;
};

const STATUSES: Influencer["status"][] = ["prospect", "contacted", "negotiating", "active", "declined"];
const STATUS_LABEL: Record<string, string> = { prospect: "Prospect", contacted: "Contacted", negotiating: "Negotiating", active: "Active", declined: "Declined" };

function Notice({ tone, children }: { tone: "error" | "success"; children: React.ReactNode }) {
  return <div className={`mb-4 rounded-xl border p-3 text-sm ${tone === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{children}</div>;
}

export function InfluencersConsole() {
  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [outreachFor, setOutreachFor] = useState<Influencer | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/influencers", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setInfluencers(d.influencers || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function setStatus(inf: Influencer, status: Influencer["status"]) {
    setError(null);
    try {
      const r = await fetch(`/api/influencers/${inf.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function remove(inf: Influencer) {
    if (!confirm(`Remove @${inf.handle}?`)) return;
    await fetch(`/api/influencers/${inf.id}`, { method: "DELETE" });
    await load();
  }

  const byStatus = (s: Influencer["status"]) => influencers.filter(i => i.status === s);

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-violet-700"><Users size={16} /> Discovery + outreach</div>
          <h2 className="text-2xl font-semibold tracking-tight">Influencers</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">Discover creators via Instagram's public business-discovery lookup or one page you paste in; track status; draft and send outreach.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={load}><RefreshCcw size={14} className={`mr-2 ${loading ? "animate-spin" : ""}`} />Refresh</Button>
          <Button onClick={() => setAdding(true)}><Plus size={14} className="mr-2" />Discover / add</Button>
        </div>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {message && <Notice tone="success">{message}</Notice>}

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
        {STATUSES.map(status => (
          <div key={status} className="rounded-2xl border bg-white p-3">
            <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase text-slate-500"><span>{STATUS_LABEL[status]}</span><span>{byStatus(status).length}</span></div>
            <div className="grid gap-2">
              {byStatus(status).map(inf => (
                <div key={inf.id} className="rounded-xl border bg-slate-50 p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium">@{inf.handle}</div>
                      <div className="text-[11px] capitalize text-slate-500">{inf.platform}{inf.followerCount != null ? ` · ${inf.followerCount.toLocaleString()} followers` : ""}</div>
                    </div>
                    <button onClick={() => remove(inf)} aria-label={`Remove @${inf.handle}`} className="shrink-0 text-slate-400 hover:text-rose-600"><Trash2 size={13} /></button>
                  </div>
                  {inf.niche && <p className="mt-1 line-clamp-2 text-[11px] text-slate-500">{inf.niche}</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <select value={inf.status} onChange={e => setStatus(inf, e.target.value as Influencer["status"])} className="h-7 rounded-md border border-slate-300 bg-white px-1.5 text-[11px]">
                      {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                    </select>
                    <Button size="sm" variant="secondary" onClick={() => setOutreachFor(inf)} className="h-7 px-2 text-[11px]"><Send size={11} className="mr-1" />Outreach</Button>
                    {inf.profileUrl && <a href={inf.profileUrl} target="_blank" rel="noreferrer" className="text-[11px] text-violet-700 hover:underline">Profile</a>}
                  </div>
                </div>
              ))}
              {!byStatus(status).length && <div className="rounded-xl border border-dashed p-3 text-center text-[11px] text-slate-400">Empty</div>}
            </div>
          </div>
        ))}
      </div>

      {adding && <DiscoverModal onClose={() => setAdding(false)} onDone={async (msg) => { setAdding(false); setMessage(msg); await load(); }} />}
      {outreachFor && <OutreachModal influencer={outreachFor} onClose={() => setOutreachFor(null)} onSent={async (msg) => { setOutreachFor(null); setMessage(msg); await load(); }} />}
    </div>
  );
}

function DiscoverModal({ onClose, onDone }: { onClose: () => void; onDone: (message: string) => Promise<void> }) {
  const [mode, setMode] = useState<"instagram" | "url" | "manual">("instagram");
  const [username, setUsername] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [nicheHint, setNicheHint] = useState("");
  const [handle, setHandle] = useState("");
  const [platform, setPlatform] = useState("instagram");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cls = "min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const body = mode === "instagram" ? { mode, username } : mode === "url" ? { mode, sourceUrl, nicheHint } : { mode, handle, platform };
      const r = await fetch("/api/influencers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      const count = d.influencers?.length ?? 1;
      await onDone(`Added ${count} influencer(s).`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 p-4">
      <div className="mx-auto my-10 max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-start justify-between">
          <div className="text-xl font-semibold">Discover / add influencer</div>
          <button onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-800 hover:bg-slate-200"><X size={16} /></button>
        </div>
        <div className="mb-4 grid grid-cols-3 gap-2">
          {(["instagram", "url", "manual"] as const).map(m => (
            <button key={m} type="button" onClick={() => setMode(m)} className={`rounded-lg border px-3 py-2 text-xs font-semibold capitalize ${mode === m ? "border-violet-500 bg-violet-50 text-violet-700" : "border-slate-200 text-slate-600"}`}>{m === "instagram" ? "IG username" : m === "url" ? "Paste a URL" : "Manual"}</button>
          ))}
        </div>
        <div className="grid gap-3">
          {mode === "instagram" && <label className="grid gap-1 text-sm"><span className="font-medium text-slate-700">Instagram username (public Business/Creator account)</span><input value={username} onChange={e => setUsername(e.target.value)} placeholder="creatorname" className={cls} /></label>}
          {mode === "url" && <>
            <label className="grid gap-1 text-sm"><span className="font-medium text-slate-700">Public page URL</span><input value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} placeholder="https://example.com/best-creators" className={cls} /></label>
            <label className="grid gap-1 text-sm"><span className="font-medium text-slate-700">Niche hint (optional)</span><input value={nicheHint} onChange={e => setNicheHint(e.target.value)} className={cls} /></label>
            <p className="text-[11px] text-slate-500">AI extracts only the creators already listed on this one page — never crawls beyond it.</p>
          </>}
          {mode === "manual" && <>
            <label className="grid gap-1 text-sm"><span className="font-medium text-slate-700">Handle</span><input value={handle} onChange={e => setHandle(e.target.value)} className={cls} /></label>
            <label className="grid gap-1 text-sm"><span className="font-medium text-slate-700">Platform</span><input value={platform} onChange={e => setPlatform(e.target.value)} className={cls} /></label>
          </>}
        </div>
        {error && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "Working…" : "Add"}</Button>
        </div>
      </div>
    </div>
  );
}

function OutreachModal({ influencer, onClose, onSent }: { influencer: Influencer; onClose: () => void; onSent: (message: string) => Promise<void> }) {
  const [channel, setChannel] = useState<"email" | "instagram_dm">(influencer.contactEmail ? "email" : "instagram_dm");
  const [proposal, setProposal] = useState("");
  const [brandContext, setBrandContext] = useState("");
  const [emailFrom, setEmailFrom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ draft?: { subject: string; message: string }; sent?: boolean; note?: string } | null>(null);
  const cls = "min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";

  async function send() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await fetch(`/api/influencers/${influencer.id}/outreach`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ channel, proposal, brandContext, emailFrom: channel === "email" ? emailFrom : undefined })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setResult(d);
      if (d.sent) await onSent(`Outreach sent to @${influencer.handle}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 p-4">
      <div className="mx-auto my-10 max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-start justify-between">
          <div className="text-xl font-semibold">Outreach to @{influencer.handle}</div>
          <button onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-800 hover:bg-slate-200"><X size={16} /></button>
        </div>
        <div className="grid gap-3">
          <label className="grid gap-1 text-sm"><span className="font-medium text-slate-700">Channel</span>
            <select value={channel} onChange={e => setChannel(e.target.value as any)} className={cls}>
              <option value="email">Email {influencer.contactEmail ? `(${influencer.contactEmail})` : "(no email on file)"}</option>
              <option value="instagram_dm">Instagram DM (draft-only unless an open conversation exists)</option>
            </select>
          </label>
          {channel === "email" && <label className="grid gap-1 text-sm"><span className="font-medium text-slate-700">From (verified Resend sender)</span><input value={emailFrom} onChange={e => setEmailFrom(e.target.value)} placeholder="you@yourdomain.com" className={cls} /></label>}
          <label className="grid gap-1 text-sm"><span className="font-medium text-slate-700">Collaboration proposal</span><textarea rows={2} value={proposal} onChange={e => setProposal(e.target.value)} className={cls} /></label>
          <label className="grid gap-1 text-sm"><span className="font-medium text-slate-700">Brand/business context</span><textarea rows={2} value={brandContext} onChange={e => setBrandContext(e.target.value)} className={cls} /></label>
        </div>
        {result && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
            {result.draft && <><div className="text-xs font-semibold text-slate-500">{result.draft.subject}</div><p className="mt-1 whitespace-pre-wrap text-slate-700">{result.draft.message}</p></>}
            {result.note && <div className="mt-2 flex items-start gap-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900"><Mail size={13} className="mt-0.5 shrink-0" />{result.note}</div>}
            {result.sent && <div className="mt-2 text-xs font-semibold text-emerald-700">Sent.</div>}
          </div>
        )}
        {error && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Close</Button>
          <Button onClick={send} disabled={busy}>{busy ? "Working…" : "Draft & send"}</Button>
        </div>
      </div>
    </div>
  );
}
