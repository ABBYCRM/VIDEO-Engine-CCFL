"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Database,
  ExternalLink,
  Image as ImageIcon,
  Key,
  Loader2,
  Play,
  Power,
  PowerOff,
  RefreshCcw,
  Sliders,
  Sparkles,
  Trash2,
  Wand2,
  Wrench,
  Youtube,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// ─── types ────────────────────────────────────────────────────────────
type SystemPayload = {
  ok?: boolean;
  app?: { ok: boolean; version?: string; build?: string; uptimeSec?: number };
  database?: { ok: boolean; engine?: string; path?: string; dbName?: string };
  videoProviders?: Record<string, { configured: boolean; live: boolean; status?: number; latencyMs?: number; error?: string | null; model?: string }>;
  imageProvider?: { provider: string; model: string; configured: boolean };
  composio?: { configured: boolean };
  avatars?: { total: number; withReference: number; stuck: number };
  jobs?: { active: number; queued: number; failed: number; completed: number };
  calendar?: { total: number; pending: number; approved: number; published: number; failed: number };
  campaignAutopilot?: { running: boolean; queued: number };
  youtube?: { configured: boolean; channelTitle?: string };
  instagram?: { configured: boolean; live?: boolean; username?: string | null; igUserId?: string | null; error?: string | null };
  env?: Record<string, boolean>;
};

type ApiCall = { label: string; method: "GET" | "POST" | "DELETE" | "PUT"; path: string; body?: unknown; description: string; tone?: "primary" | "secondary" | "destructive" };

async function callApi(call: ApiCall): Promise<{ ok: boolean; status: number; data: unknown; text: string }> {
  const init: RequestInit = { method: call.method, headers: { "Content-Type": "application/json" }, cache: "no-store" };
  if (call.body !== undefined && (call.method === "POST" || call.method === "PUT")) init.body = JSON.stringify(call.body);
  const r = await fetch(call.path, init);
  const text = await r.text();
  let data: unknown = text;
  try { data = JSON.parse(text); } catch {}
  return { ok: r.ok, status: r.status, data, text };
}

function StatusDot({ ok }: { ok: boolean }) {
  return <span className={`inline-block h-2 w-2 rounded-full ${ok ? "bg-emerald-500" : "bg-rose-500"}`} aria-hidden />;
}

function Panel({ title, icon: Icon, children, right, defaultOpen = true }: { title: string; icon: React.ComponentType<{ size?: number; className?: string }>; children: React.ReactNode; right?: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className="overflow-hidden">
      <button type="button" onClick={() => setOpen(o => !o)} className="flex w-full items-center gap-3 px-5 py-4 text-left">
        {open ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
        <Icon size={16} className="text-violet-600" />
        <span className="text-sm font-semibold text-slate-900">{title}</span>
        {right && <span className="ml-auto">{right}</span>}
      </button>
      {open && <div className="border-t border-slate-200 px-5 py-4">{children}</div>}
    </Card>
  );
}

function ResultBlock({ result }: { result: { ok: boolean; status: number; text: string; data: unknown } | null }) {
  if (!result) return null;
  return (
    <div className={`mt-3 rounded-lg border p-3 text-xs ${result.ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"}`}>
      <div className="mb-1 flex items-center gap-2 font-semibold">
        {result.ok ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
        HTTP {result.status} {result.ok ? "OK" : "ERROR"}
      </div>
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px]">{result.text.slice(0, 2000)}</pre>
    </div>
  );
}

function ActionButton({ call, onRun, busy, result }: { call: ApiCall; onRun: (c: ApiCall) => void; busy: boolean; result: { ok: boolean; status: number; text: string; data: unknown } | null }) {
  const variant = call.tone === "destructive" ? "destructive" : call.tone === "secondary" ? "secondary" : "default";
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-slate-900">{call.label}</div>
          <div className="mt-0.5 truncate text-[11px] text-slate-500">{call.method} <code className="rounded bg-slate-100 px-1 text-[10px]">{call.path}</code></div>
          {call.description && <div className="mt-1 text-[11px] text-slate-600">{call.description}</div>}
        </div>
        <Button size="sm" variant={variant as any} disabled={busy} onClick={() => onRun(call)}>
          {busy ? <Loader2 size={12} className="mr-1 animate-spin" /> : <Play size={12} className="mr-1" />}
          Run
        </Button>
      </div>
      <ResultBlock result={result} />
    </div>
  );
}

// ─── pipeline sections ────────────────────────────────────────────────
const PROVIDER_SWITCH_CALLS: ApiCall[] = [
  { method: "PUT", path: "/api/admin/settings", body: { defaultProvider: "hedra", hedraModel: "fal/grok-video-i2v" }, label: "Video: Hedra · grok-video-i2v", description: "Default video jobs to Hedra Grok Video image-to-video (hero still as first frame).", tone: "primary" },
  { method: "PUT", path: "/api/admin/settings", body: { defaultProvider: "hedra", hedraModel: "hedra-character-3" }, label: "Video: Hedra Character 3", description: "Default video jobs to Hedra Character 3 (talking avatar; needs start image + driving audio).", tone: "primary" },
  { method: "POST", path: "/api/admin/image-provider", body: { provider: "hedra", model: "flux2-max" }, label: "Image: Hedra · flux2-max", description: "Switch image generation to Hedra FLUX.2 [max] (3.5¢/gen).", tone: "primary" },
  { method: "POST", path: "/api/admin/image-provider", body: { provider: "hedra", model: "gpt-image-2" }, label: "Image: Hedra · gpt-image-2", description: "Switch image generation to Hedra-hosted GPT Image 2 (supports reference editing).", tone: "primary" },
  { method: "POST", path: "/api/admin/image-provider", body: { provider: "hedra", model: "imagen-4" }, label: "Image: Hedra · imagen-4", description: "Switch image generation to Hedra Imagen 4.", tone: "primary" },
  { method: "POST", path: "/api/admin/image-provider", body: { provider: "hedra", model: "seedream-5" }, label: "Image: Hedra · seedream-5", description: "Switch image generation to Hedra Seedream 5.", tone: "secondary" },
  { method: "POST", path: "/api/admin/image-provider", body: { provider: "gemini", model: "gemini-2.5-flash-image" }, label: "Image: Gemini 2.5 Flash", description: "Switch image generation to Google Gemini (multimodal, fast, ~30s).", tone: "secondary" },
  { method: "POST", path: "/api/admin/image-provider", body: { provider: "openai", model: "gpt-image-1" }, label: "Image: OpenAI gpt-image-1", description: "Switch image generation to OpenAI gpt-image-1 (supports reference editing, slow).", tone: "secondary" },
];

const AUTOPILOT_CALLS: ApiCall[] = [
  { method: "POST", path: "/api/internal/campaign-autopilot", label: "Run autopilot (one pass)", description: "Pick up next pending slot, advance the campaign queue, generate any missing media. Idempotent.", tone: "primary" },
  { method: "POST", path: "/api/admin/campaigns/rearm-pending", body: {}, label: "Rearm pending slots", description: "Reset slots stuck in pending_manual / failed-A2E so the next autopilot run will re-try them.", tone: "secondary" },
  { method: "POST", path: "/api/admin/calendar/rebuild-videos", body: {}, label: "Rebuild all future videos", description: "Detach old compositions and requeue every unpublished campaign video from a clean state.", tone: "destructive" },
];

const CALENDAR_CALLS: ApiCall[] = [
  { method: "POST", path: "/api/calendar/auto-approve", label: "Auto-approve all ready", description: "Mark every pending slot with media_url as approved+auto_post so the publisher will post it.", tone: "primary" },
  { method: "POST", path: "/api/calendar/bulk-approve", body: {}, label: "Bulk-approve all pending", description: "Approve every still-pending slot (no media filter) and turn auto_post on.", tone: "primary" },
  { method: "POST", path: "/api/admin/calendar/scrub-captions", label: "Scrub operator-language captions", description: "Walk every scheduled_post, detect AI/operator language patterns, regenerate the public caption. One-shot cleanup.", tone: "primary" },
  { method: "POST", path: "/api/calendar/clear", label: "Clear all future slots", description: "Drop every future unpublished slot. Destructive — calendar will need to be re-planned.", tone: "destructive" },
  { method: "POST", path: "/api/calendar/spread", label: "Spread calendar evenly", description: "Re-space existing approved slots evenly across the week.", tone: "secondary" },
];

const STOCK_UPPER_CALLS: ApiCall[] = [
  { method: "POST", path: "/api/admin/stock-uppers", body: { url: "https://upload.wikimedia.org/wikipedia/commons/transcoded/8/86/2024-03-20_Sunset_over_Interstate_75.webm/2024-03-20_Sunset_over_Interstate_75.webm.480p.vp9.webm", category: "trucking", label: "Wikimedia trucking" }, label: "Import trucking stock", description: "Import a Wikimedia Commons public-domain clip into the stock-upper library under 'trucking'.", tone: "secondary" },
  { method: "GET", path: "/api/admin/stock-uppers", label: "List stock-upper library", description: "Read every persisted stock upper by category.", tone: "secondary" },
];

const YOUTUBE_CALLS: ApiCall[] = [
  { method: "GET", path: "/api/admin/youtube", label: "Read YouTube status", description: "Check whether YouTube is configured and which channel is connected.", tone: "secondary" },
  { method: "GET", path: "/api/admin/youtube/connect", label: "Start YouTube OAuth", description: "Begin the OAuth flow that will let the publisher mirror Reels to YouTube Shorts.", tone: "primary" },
  { method: "DELETE", path: "/api/admin/youtube", label: "Disconnect YouTube", description: "Clear stored YouTube credentials. Publisher will stop mirroring until reconnected.", tone: "destructive" },
];

const SYSTEM_CALLS: ApiCall[] = [
  { method: "GET", path: "/api/health", label: "Read /api/health", description: "Deep diagnostic — databases, live provider statuses, and latency.", tone: "secondary" },
  { method: "GET", path: "/api/admin/system", label: "Read /api/admin/system", description: "Full operator dashboard: providers, jobs, avatars, calendar, env flags.", tone: "secondary" },
  { method: "GET", path: "/api/admin/system/a2e-debug", label: "A2E debug dump", description: "Inspect A2E provider health, rate limits, last error body, and account remaining time.", tone: "secondary" },
  { method: "POST", path: "/api/admin/system/migrate-pg", body: {}, label: "Run PG migrations", description: "Apply schema migrations to the Postgres mirror if DATABASE_URL is set.", tone: "secondary" },
  { method: "POST", path: "/api/admin/system/test-pg", body: {}, label: "Test Postgres connection", description: "Ping the Postgres mirror to confirm it is reachable and authenticated.", tone: "secondary" },
  { method: "GET", path: "/api/admin/providers/live", label: "Live provider status", description: "Re-probe every provider's live endpoint with the current key.", tone: "secondary" },
];

// ─── main component ───────────────────────────────────────────────────
export function PipelineConsole() {
  const [system, setSystem] = useState<SystemPayload | null>(null);
  const [systemErr, setSystemErr] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, { ok: boolean; status: number; text: string; data: unknown }>>({});

  const loadSystem = useCallback(async () => {
    setSystemErr(null);
    try {
      const r = await fetch("/api/admin/system", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setSystem(j);
    } catch (e) {
      setSystemErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => { loadSystem(); }, [loadSystem]);

  const run = useCallback(async (call: ApiCall) => {
    const k = `${call.method}:${call.path}:${JSON.stringify(call.body || {})}`;
    setBusyKey(k);
    try {
      const res = await callApi(call);
      setResults(prev => ({ ...prev, [k]: res }));
      // Auto-refresh system panel after mutations
      if (call.method !== "GET") {
        setTimeout(() => loadSystem(), 1200);
      }
    } finally {
      setBusyKey(null);
    }
  }, [loadSystem]);

  const getResult = (call: ApiCall) => {
    const k = `${call.method}:${call.path}:${JSON.stringify(call.body || {})}`;
    return { result: results[k] || null, busy: busyKey === k };
  };

  return (
    <AuthGuard>
      <AppShell>
        <div className="space-y-6">
          <PageHeader
            eyebrow="Operator control center"
            eyebrowIcon={<Sliders size={16} />}
            title="Pipeline"
            description="Every admin operation in one place. Run autopilot passes, switch providers, rebuild calendars, scrub captions, import stock footage, debug providers. No need to open a terminal."
          />

          <Panel title="System status" icon={Activity} right={<Button size="sm" variant="ghost" onClick={loadSystem}><RefreshCcw size={12} className={`mr-1 ${busyKey === "refresh" ? "animate-spin" : ""}`} />Refresh</Button>}>
            {systemErr && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">{systemErr}</div>}
            {!system && !systemErr && <div className="text-xs text-slate-500">Loading…</div>}
            {system && (
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">App</div>
                  <div className="mt-1 flex items-center gap-2 text-sm"><StatusDot ok={Boolean(system.app?.ok)} /> {system.app?.version || "?"} {system.app?.build ? <code className="text-[10px] text-slate-400">({system.app.build})</code> : null}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Databases</div>
                  <div className="mt-1 flex items-center gap-2 text-sm"><StatusDot ok={Boolean(system.database?.ok)} /> {system.database?.engine || "?"} {system.database?.dbName ? <span className="text-xs text-slate-500">({system.database.dbName})</span> : null}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Image provider</div>
                  <div className="mt-1 text-sm">
                    {system.imageProvider?.provider ? (
                      <>
                        <StatusDot ok={Boolean(system.imageProvider.configured)} /> {system.imageProvider.provider} · <code className="text-[10px]">{system.imageProvider.model}</code>
                      </>
                    ) : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Video providers</div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm">
                    {Object.entries(system.videoProviders || {}).map(([id, p]) => (
                      <span key={id} className="flex items-center gap-1"><StatusDot ok={Boolean(p?.live)} /> {id} {p?.latencyMs != null ? <span className="text-[10px] text-slate-400">({p.latencyMs}ms)</span> : null}</span>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Jobs</div>
                  <div className="mt-1 text-sm">
                    {system.jobs ? (
                      <span>{system.jobs.active} active · {system.jobs.queued} queued · {system.jobs.failed} failed · {system.jobs.completed} done</span>
                    ) : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Calendar</div>
                  <div className="mt-1 text-sm">
                    {system.calendar ? (
                      <span>{system.calendar.total} total · {system.calendar.pending} pending · {system.calendar.approved} approved · {system.calendar.published} published · {system.calendar.failed} failed</span>
                    ) : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Avatars</div>
                  <div className="mt-1 text-sm">
                    {system.avatars ? <span>{system.avatars.total} total · {system.avatars.withReference} with ref · <span className={system.avatars.stuck ? "text-rose-700" : "text-emerald-700"}>{system.avatars.stuck} stuck</span></span> : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Autopilot</div>
                  <div className="mt-1 text-sm">
                    {system.campaignAutopilot ? <span><StatusDot ok={!system.campaignAutopilot.running} /> {system.campaignAutopilot.running ? "running" : "idle"} · {system.campaignAutopilot.queued} queued</span> : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">YouTube</div>
                  <div className="mt-1 text-sm">
                    {system.youtube ? <><StatusDot ok={Boolean(system.youtube.configured)} /> {system.youtube.configured ? (system.youtube.channelTitle || "connected") : "not connected"}</> : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Instagram Graph</div>
                  <div className="mt-1 text-sm"><StatusDot ok={Boolean(system.instagram?.live)} /> {system.instagram?.live ? `@${system.instagram.username}` : system.instagram?.configured ? "configured · offline" : "not configured"}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Composio</div>
                  <div className="mt-1 text-sm"><StatusDot ok={Boolean(system.composio?.configured)} /> {system.composio?.configured ? "configured" : "not configured"}</div>
                </div>
              </div>
            )}
          </Panel>

          <Panel title="Provider switcher" icon={Sparkles} defaultOpen={true}>
            <p className="mb-3 text-xs text-slate-600">Switch the global image and video providers. The settings are stored in the <code>settings</code> table and picked up by every worker on the next call.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {PROVIDER_SWITCH_CALLS.map((c, i) => {
                const { result, busy } = getResult(c);
                return <ActionButton key={i} call={c} onRun={run} busy={busy} result={result} />;
              })}
            </div>
          </Panel>

          <Panel title="Autopilot + queue" icon={Power} defaultOpen={true}>
            <p className="mb-3 text-xs text-slate-600">The autopilot advances the campaign queue: it picks the next pending slot, generates the upper + lower video lanes, composes the split, and writes the result back to the calendar slot. Run a single pass or rearm stuck slots.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {AUTOPILOT_CALLS.map((c, i) => {
                const { result, busy } = getResult(c);
                return <ActionButton key={i} call={c} onRun={run} busy={busy} result={result} />;
              })}
            </div>
          </Panel>

          <Panel title="Calendar control" icon={Wand2}>
            <p className="mb-3 text-xs text-slate-600">Bulk operations on the scheduled_posts table. Use these to unblock a stalled calendar or to clean up bad captions from a previous run.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {CALENDAR_CALLS.map((c, i) => {
                const { result, busy } = getResult(c);
                return <ActionButton key={i} call={c} onRun={run} busy={busy} result={result} />;
              })}
            </div>
          </Panel>

          <Panel title="Stock upper library" icon={ImageIcon}>
            <p className="mb-3 text-xs text-slate-600">Persistent library of pre-made upper-lane clips. The autopilot will pick from here first before generating a new upper. Import a Wikimedia Commons public-domain clip to seed a category.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {STOCK_UPPER_CALLS.map((c, i) => {
                const { result, busy } = getResult(c);
                return <ActionButton key={i} call={c} onRun={run} busy={busy} result={result} />;
              })}
            </div>
          </Panel>

          <Panel title="YouTube Shorts" icon={Youtube}>
            <p className="mb-3 text-xs text-slate-600">Mirror every published Instagram Reel to YouTube Shorts. Connect a YouTube channel via OAuth, and the publisher will upload automatically without blocking the IG publish.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {YOUTUBE_CALLS.map((c, i) => {
                const { result, busy } = getResult(c);
                return <ActionButton key={i} call={c} onRun={run} busy={busy} result={result} />;
              })}
            </div>
          </Panel>

          <Panel title="System + database" icon={Database} defaultOpen={false}>
            <p className="mb-3 text-xs text-slate-600">Health probes, debug dumps, and Postgres maintenance.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {SYSTEM_CALLS.map((c, i) => {
                const { result, busy } = getResult(c);
                return <ActionButton key={i} call={c} onRun={run} busy={busy} result={result} />;
              })}
            </div>
          </Panel>

          <Panel title="Quick links" icon={ExternalLink} defaultOpen={false}>
            <div className="grid gap-2 sm:grid-cols-3">
              <a href="/"><Button variant="secondary" className="w-full">Create</Button></a>
              <a href="/calendar"><Button variant="secondary" className="w-full">Calendar</Button></a>
              <a href="/library"><Button variant="secondary" className="w-full">Library</Button></a>
              <a href="/avatars"><Button variant="secondary" className="w-full">Avatars</Button></a>
              <a href="/sites"><Button variant="secondary" className="w-full">Sites</Button></a>
              <a href="/integrations"><Button variant="secondary" className="w-full">Integrations</Button></a>
              <a href="/settings"><Button variant="secondary" className="w-full">Settings</Button></a>
              <a href="/campaigns"><Button variant="secondary" className="w-full">Campaigns</Button></a>
              <a href="/docs"><Button variant="secondary" className="w-full">Docs</Button></a>
            </div>
          </Panel>
        </div>
      </AppShell>
    </AuthGuard>
  );
}
