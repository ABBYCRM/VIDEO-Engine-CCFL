"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Loader2, Play, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { campaignTemplates, type CampaignCategory } from "@/lib/prompts";

type ProviderId = "hedra" | "veo" | "grok" | "a2e";

const PROVIDER_OPTIONS: Array<{ id: ProviderId; label: string }> = [
  { id: "hedra", label: "Hedra Character / Avatar" },
  { id: "veo", label: "Google Veo 3.1 (direct)" },
  { id: "grok", label: "xAI Grok Imagine" },
  { id: "a2e", label: "A2E AI multi-model" },
];

type JobRow = {
  id: string;
  category: CampaignCategory;
  provider: ProviderId;
  status: string;
  error: string | null;
  fileUrl: string | null;
  createdAt: string;
};

const CATEGORIES = Object.entries(campaignTemplates) as Array<[CampaignCategory, { title: string; instruction: string }]>;

export function GeneratorConsole() {
  const [category, setCategory] = useState<CampaignCategory>("car_accident");
  const [provider, setProvider] = useState<ProviderId>("hedra");
  const [mission, setMission] = useState("");
  const [subject, setSubject] = useState("");
  const [script, setScript] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const loadJobs = useCallback(async () => {
    const r = await fetch("/api/v1/video", { cache: "no-store" });
    if (!r.ok) return;
    const body = await r.json();
    setJobs(body.jobs || []);
  }, []);

  useEffect(() => { void loadJobs(); }, [loadJobs]);

  useEffect(() => {
    if (!activeId) return;
    const timer = setInterval(async () => {
      const r = await fetch(`/api/v1/video/${activeId}`, { cache: "no-store" });
      if (!r.ok) return;
      const job = await r.json();
      await loadJobs();
      if (job.status === "succeeded" || job.status === "failed") setActiveId(null);
    }, 4000);
    return () => clearInterval(timer);
  }, [activeId, loadJobs]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/v1/video", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ category, provider, mission, subject, script, aspectRatio: "9:16", resolution: "1080p" }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
      setActiveId(body.id);
      await loadJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthGuard>
      <AppShell>
        <div className="mx-auto w-full max-w-5xl px-3 py-8 sm:px-4">
          <div className="mb-6">
            <p className="text-[13px] font-medium text-muted-foreground">One-shot generation</p>
            <h1 className="text-[32px] font-semibold tracking-tight text-foreground">Create</h1>
            <p className="mt-1 text-[14px] text-muted-foreground">
              Exactly one provider operation. Exactly one 8-second continuous shot. No extensions, no stitch.
            </p>
          </div>

          <form onSubmit={submit} className="grid gap-5">
            <div>
              <div className="mb-2 text-[13px] font-medium text-foreground">Campaign category</div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                {CATEGORIES.map(([id, tmpl]) => {
                  const active = category === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setCategory(id)}
                      className={`rounded-xl border px-3 py-3 text-left transition ${
                        active
                          ? "border-[hsl(var(--claw-accent))] bg-[hsl(var(--claw-accent))]/10"
                          : "border-border hover:bg-muted"
                      }`}
                    >
                      <div className="text-[13px] font-semibold text-foreground">{tmpl.title}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground">8-second one-shot</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="grid gap-1.5 text-[13px]">
              <span className="font-medium text-foreground">Provider</span>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value as ProviderId)}
                className="h-11 rounded-xl border border-border bg-[hsl(var(--claw-elevated))] px-3 text-sm"
              >
                {PROVIDER_OPTIONS.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </label>

            <label className="grid gap-1.5 text-[13px]">
              <span className="font-medium text-foreground">Mission</span>
              <Textarea value={mission} onChange={(e) => setMission(e.target.value)} placeholder="Create a realistic PI-awareness shot after a rear-end collision" rows={3} />
            </label>
            <label className="grid gap-1.5 text-[13px]">
              <span className="font-medium text-foreground">Subject</span>
              <Textarea value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Adult woman safely standing beside a damaged sedan" rows={2} />
            </label>
            <label className="grid gap-1.5 text-[13px]">
              <span className="font-medium text-foreground">Spoken script (20 words max)</span>
              <Textarea value={script} onChange={(e) => setScript(e.target.value)} placeholder="I didn't know what I needed to document after the crash." rows={2} />
            </label>

            {error && <div className="text-sm text-rose-500">{error}</div>}

            <Button type="submit" disabled={busy} className="w-full sm:w-auto">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
              <span className="ml-2">{busy ? "Starting one shot…" : "Generate 8-second shot"}</span>
            </Button>
          </form>

          <div className="mt-10">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Recent jobs</h2>
              <button type="button" onClick={() => void loadJobs()} className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground">
                <RefreshCw size={13} /> Refresh
              </button>
            </div>
            <div className="grid gap-3">
              {jobs.length === 0 && <p className="text-sm text-muted-foreground">No jobs yet.</p>}
              {jobs.map((job) => (
                <div key={job.id} className="rounded-xl border border-border p-3">
                  <div className="flex flex-wrap items-center gap-2 text-[13px]">
                    <span className="font-medium">{campaignTemplates[job.category]?.title || job.category}</span>
                    <span className="text-muted-foreground">{job.provider}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">{job.status}</span>
                  </div>
                  {job.error && <p className="mt-1 text-[12px] text-rose-500">{job.error}</p>}
                  {job.fileUrl && (
                    <video className="mt-3 w-full max-w-sm rounded-lg" controls src={job.fileUrl} />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </AppShell>
    </AuthGuard>
  );
}
