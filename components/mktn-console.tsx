"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertCircle, ArrowRight, BookOpen, BrainCircuit, Check, CheckCircle2,
  ExternalLink, Image as ImageIcon, KeyRound, Layers3, Loader2, Radio,
  Route, Search, Settings, Share2, ShieldCheck, Sparkles, WandSparkles, Workflow, Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type View = "guide" | "plan" | "generate" | "distribute" | "settings";
type Provider = "nvidia" | "hedra" | "gemini" | "a2e";
type ProviderState = Record<Provider, { configured: boolean; source: "saved" | "environment" | "none" }>;
type Guide = { name: string; definition: string; category: string; aliases: string[]; when: string; where: string; how: string; why: string; caution?: string };

const views: Array<{ id: View; label: string; hint: string; icon: typeof BookOpen }> = [
  { id: "guide", label: "Guide", hint: "Use the language", icon: BookOpen },
  { id: "plan", label: "Plan", hint: "Shape the strategy", icon: Route },
  { id: "generate", label: "Generate", hint: "Produce creative", icon: ImageIcon },
  { id: "distribute", label: "Distribute", hint: "Run Composio", icon: Share2 },
  { id: "settings", label: "Settings", hint: "Wire providers", icon: Settings },
];

const providerMeta: Record<Provider, { label: string; role: string; order: string }> = {
  nvidia: { label: "NVIDIA NIM", role: "Fast campaign reasoning", order: "CORE" },
  hedra: { label: "Hedra", role: "Primary image provider", order: "01" },
  gemini: { label: "Gemini", role: "First image fallback", order: "02" },
  a2e: { label: "A2E", role: "Final image fallback", order: "03" },
};

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data as T;
}

export function MktnConsole() {
  const [view, setView] = useState<View>("guide");
  const active = views.find((item) => item.id === view) ?? views[0];

  return <div className="pb-16">
    <section className="mb-6 grid gap-3 lg:grid-cols-[1.35fr_.65fr]" aria-label="MKTN system overview">
      <div className="signal-panel signal-grid signal-scan min-h-[210px] rounded-xl p-5 sm:p-7">
        <div className="relative z-10 flex h-full flex-col justify-between gap-8">
          <div className="flex items-start justify-between gap-4">
            <div><div className="signal-kicker">Live routing fabric</div><h2 className="mt-4 max-w-xl text-2xl font-semibold leading-tight tracking-[-0.045em] sm:text-4xl">From market signal to shipped creative.</h2></div>
            <span className="hidden items-center gap-2 rounded-md border border-[hsl(var(--success))]/25 bg-[hsl(var(--success))]/10 px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-widest text-[hsl(var(--success))] sm:flex"><Radio size={11} /> operational</span>
          </div>
          <div className="flex flex-wrap items-center gap-2.5" aria-label="Image provider failover order">
            {["Hedra", "Gemini", "A2E"].map((name, index) => <div className="contents" key={name}>
              <div className={`rounded-md border px-3 py-2 ${index === 0 ? "border-[hsl(var(--claw-accent))]/40 bg-[hsl(var(--claw-accent))]/10" : "border-border bg-background/60"}`}>
                <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">{index === 0 ? "primary" : `fallback 0${index}`}</div>
                <div className="mt-1 text-xs font-semibold">{name}</div>
              </div>
              {index < 2 && <ArrowRight size={14} className="text-[hsl(var(--claw-accent))]" />}
            </div>)}
            <div className="ml-auto hidden items-center gap-2 border-l border-border pl-4 text-xs text-muted-foreground xl:flex"><ShieldCheck size={15} className="text-[hsl(var(--claw-accent))]" /> no duplicate paid jobs</div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Metric icon={BrainCircuit} value="NIM" label="Reasoning core" accent />
        <Metric icon={Layers3} value="13" label="Marketing domains" />
        <Metric icon={Workflow} value="3×" label="Image resilience" />
        <Metric icon={Zap} value="LIVE" label="Composio mesh" />
      </div>
    </section>

    <div className="mb-6 overflow-x-auto rounded-xl border border-border bg-[hsl(var(--claw-elevated))]/70 p-1.5 shadow-[0_12px_40px_hsl(222_40%_2%/.05)]">
      <nav className="grid min-w-[760px] grid-cols-5 gap-1" aria-label="MKTN sections">
        {views.map((item, index) => {
          const Icon = item.icon;
          const isActive = view === item.id;
          return <button key={item.id} type="button" onClick={() => setView(item.id)} aria-current={isActive ? "page" : undefined}
            className={`group relative flex min-h-[62px] items-center gap-3 rounded-lg border px-3 text-left transition-all ${isActive ? "border-[hsl(var(--claw-accent))]/30 bg-[hsl(var(--claw-accent))]/10 text-foreground" : "border-transparent text-muted-foreground hover:border-border hover:bg-muted/50 hover:text-foreground"}`}>
            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-md border ${isActive ? "border-[hsl(var(--claw-accent))]/30 text-[hsl(var(--claw-accent))]" : "border-border"}`}><Icon size={14} /></span>
            <span className="min-w-0"><span className="block text-xs font-semibold">{item.label}</span><span className="mt-0.5 block truncate text-[9px] text-muted-foreground">{item.hint}</span></span>
            <span className="absolute right-2 top-2 font-mono text-[8px] text-muted-foreground/60">0{index + 1}</span>
          </button>;
        })}
      </nav>
    </div>

    <div className="mb-4 flex items-center justify-between gap-4">
      <div><span className="signal-label">Active module</span><h2 className="mt-1 text-xl font-semibold tracking-[-0.03em]">{active.label}</h2></div>
      <span className="hidden font-mono text-[9px] uppercase tracking-[.16em] text-muted-foreground sm:block">MKTN / {view} / ready</span>
    </div>

    {view === "guide" && <GuideView />}
    {view === "plan" && <PlanView />}
    {view === "generate" && <GenerateView />}
    {view === "distribute" && <DistributeView />}
    {view === "settings" && <SettingsView />}
  </div>;
}

function Metric({ icon: Icon, value, label, accent = false }: { icon: typeof Zap; value: string; label: string; accent?: boolean }) {
  return <div className={`signal-panel flex min-h-[98px] flex-col justify-between rounded-xl p-3.5 ${accent ? "border-[hsl(var(--claw-accent))]/30 bg-[hsl(var(--claw-accent))]/10" : ""}`}>
    <Icon size={14} className={accent ? "text-[hsl(var(--claw-accent))]" : "text-muted-foreground"} />
    <div><div className="font-mono text-lg font-semibold tracking-[-0.04em]">{value}</div><div className="mt-0.5 text-[10px] leading-tight text-muted-foreground">{label}</div></div>
  </div>;
}

function GuideView() {
  const [query, setQuery] = useState("VSL");
  const [terms, setTerms] = useState<Guide[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function search() {
    setBusy(true); setError(null);
    try { setTerms((await jsonRequest<{ terms: Guide[] }>(`/api/mktn/terms?q=${encodeURIComponent(query)}`)).terms); }
    catch (e) { setError(e instanceof Error ? e.message : "Search failed."); }
    finally { setBusy(false); }
  }
  useEffect(() => { void search(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
    <div className="space-y-4 lg:sticky lg:top-5 lg:self-start">
      <Card>
        <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-md border border-[hsl(var(--claw-accent))]/25 bg-[hsl(var(--claw-accent))]/10 text-[hsl(var(--claw-accent))]"><Search size={17} /></div>
        <h3 className="text-lg font-semibold tracking-tight">Decode the playbook</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Find any term or acronym, then see exactly when, where, how, and why it earns a place in your campaign.</p>
        <form className="mt-5 grid gap-2" onSubmit={(e) => { e.preventDefault(); void search(); }}>
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="VSL, CAC, positioning…" aria-label="Search marketing terminology" />
          <Button type="submit" disabled={busy}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}<span className="ml-2">Search intelligence</span></Button>
        </form>
        <div className="mt-5 border-t border-border pt-4"><div className="signal-label">Example signals</div><div className="mt-3 flex flex-wrap gap-1.5">{["VSL", "AIDA", "ROAS", "JTBD"].map((sample) => <button key={sample} type="button" onClick={() => setQuery(sample)} className="rounded-md border border-border px-2 py-1 font-mono text-[9px] text-muted-foreground transition hover:border-[hsl(var(--claw-accent))]/40 hover:text-foreground">{sample}</button>)}</div></div>
      </Card>
      <Message error={error} />
    </div>
    <div className="grid gap-4">
      {terms.map((term, termIndex) => <Card key={`${term.category}:${term.name}`} className="!p-0">
        <div className="border-b border-border p-5 sm:p-6">
          <div className="mb-3 flex flex-wrap items-center gap-2"><span className="font-mono text-[9px] text-muted-foreground">0{termIndex + 1}</span><span className="rounded-sm bg-[hsl(var(--claw-accent))]/10 px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-[hsl(var(--claw-accent))]">{term.category}</span></div>
          <h3 className="text-2xl font-semibold tracking-[-0.04em]">{term.name}</h3>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">{term.definition}</p>
        </div>
        <dl className="grid sm:grid-cols-2">
          {[["When", term.when], ["Where", term.where], ["How", term.how], ["Why", term.why]].map(([label, value], index) => <div key={label} className={`p-5 sm:p-6 ${index < 2 ? "border-b border-border" : ""} ${index % 2 === 0 ? "sm:border-r" : ""}`}><dt className="signal-label mb-2 !text-[hsl(var(--claw-accent))]">{label}</dt><dd className="text-sm leading-6">{value}</dd></div>)}
        </dl>
        {term.caution && <div className="mx-5 mb-5 flex gap-2 rounded-md border border-[hsl(var(--warning))]/25 bg-[hsl(var(--warning))]/10 p-3 text-sm text-[hsl(var(--warning))] sm:mx-6 sm:mb-6"><AlertCircle size={15} className="mt-0.5 shrink-0" />{term.caution}</div>}
      </Card>)}
      {!busy && !error && terms.length === 0 && <Card className="text-sm text-muted-foreground">No matching terms. Try a broader concept or acronym.</Card>}
    </div>
  </div>;
}

function PlanView() {
  const [form, setForm] = useState({ product: "", audience: "", goal: "sales", funnelStage: "conversion", channels: "Meta Ads, Instagram" });
  const [result, setResult] = useState<{ narrative: string; provider: string; warning?: string } | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null); setResult(null);
    try { setResult(await jsonRequest<{ narrative: string; provider: string; warning?: string }>("/api/mktn/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, channels: form.channels.split(",").map((v) => v.trim()).filter(Boolean) }) })); }
    catch (e) { setError(e instanceof Error ? e.message : "Planning failed."); } finally { setBusy(false); }
  }
  return <div className="grid gap-4 lg:grid-cols-[.82fr_1.18fr]">
    <Card title={<span className="flex items-center gap-2"><Route size={15} className="text-[hsl(var(--claw-accent))]" />Campaign brief</span>}>
      <form className="grid gap-4" onSubmit={submit}>
        <Labeled label="Product"><Input required value={form.product} onChange={(e) => setForm({ ...form, product: e.target.value })} placeholder="What are we taking to market?" /></Labeled>
        <Labeled label="Audience"><Input required value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} placeholder="Who needs to care?" /></Labeled>
        <div className="grid gap-4 sm:grid-cols-2"><Labeled label="Goal"><Select value={form.goal} onChange={(v) => setForm({ ...form, goal: v })} options={["awareness", "leads", "sales", "activation", "retention", "research", "measurement"]} /></Labeled><Labeled label="Funnel stage"><Select value={form.funnelStage} onChange={(v) => setForm({ ...form, funnelStage: v })} options={["awareness", "consideration", "conversion", "retention"]} /></Labeled></div>
        <Labeled label="Channels"><Input required value={form.channels} onChange={(e) => setForm({ ...form, channels: e.target.value })} placeholder="Comma-separated" /></Labeled>
        <Button type="submit" size="lg" disabled={busy}>{busy ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Sparkles size={16} className="mr-2" />}Build strategy</Button>
      </form>
    </Card>
    <div className="grid min-h-[430px] gap-4"><Message error={error} />{result ? <Card title={<span className="flex items-center gap-2"><BrainCircuit size={15} className="text-[hsl(var(--claw-accent))]" />Strategy output</span>} actions={<span className="rounded-sm bg-[hsl(var(--claw-accent))]/10 px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-[hsl(var(--claw-accent))]">{result.provider}</span>}><pre className="max-h-[38rem] overflow-auto whitespace-pre-wrap font-sans text-sm leading-7">{result.narrative}</pre>{result.warning && <p className="mt-4 border-t border-border pt-4 text-xs text-[hsl(var(--warning))]">{result.warning}</p>}</Card> : <EmptyOutput icon={BrainCircuit} title="NVIDIA strategy core" text="Complete the signal brief. The reasoning engine will turn it into a campaign plan with usable terminology, channel choices, and execution logic." />}</div>
  </div>;
}

function GenerateView() {
  const [prompt, setPrompt] = useState(""); const [aspectRatio, setAspectRatio] = useState("1:1");
  const [result, setResult] = useState<{ provider: string; status: string; url?: string; dataUrl?: string; jobId?: string; failures: Array<{ provider: string; reason: string }> } | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null); setResult(null);
    try { setResult(await jsonRequest<{ provider: string; status: string; url?: string; dataUrl?: string; jobId?: string; failures: Array<{ provider: string; reason: string }> }>("/api/mktn/generate-image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, aspectRatio }) })); }
    catch (e) { setError(e instanceof Error ? e.message : "Generation failed."); } finally { setBusy(false); }
  }
  const src = result?.url || result?.dataUrl;
  return <div className="grid gap-4 lg:grid-cols-[390px_1fr]">
    <Card title={<span className="flex items-center gap-2"><WandSparkles size={15} className="text-[hsl(var(--claw-accent))]" />Creative directive</span>}>
      <div className="mb-5 grid gap-2 rounded-lg border border-border bg-background/50 p-3">
        <div className="signal-label">Execution path</div><div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-wider"><span className="text-[hsl(var(--claw-accent))]">Hedra</span><ArrowRight size={11} /><span>Gemini</span><ArrowRight size={11} /><span>A2E</span></div>
      </div>
      <form className="grid gap-4" onSubmit={submit}>
        <Labeled label="Prompt"><textarea required maxLength={8000} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Describe the campaign image, visual tension, subject, framing, lighting, and desired response…" className="min-h-52 w-full resize-y rounded-md border border-border bg-background/60 p-3.5 text-sm leading-6 outline-none transition placeholder:text-muted-foreground/60 hover:border-[hsl(var(--border-strong))] focus:border-[hsl(var(--claw-accent))]/60 focus:ring-2 focus:ring-[hsl(var(--claw-accent))]/10" /></Labeled>
        <Labeled label="Canvas"><Select value={aspectRatio} onChange={setAspectRatio} options={["1:1", "16:9", "9:16", "4:3", "3:4"]} /></Labeled>
        <Button type="submit" size="lg" disabled={busy}>{busy ? <Loader2 size={16} className="mr-2 animate-spin" /> : <WandSparkles size={16} className="mr-2" />}Generate once</Button>
        <p className="text-[10px] leading-5 text-muted-foreground"><ShieldCheck size={12} className="mr-1 inline text-[hsl(var(--success))]" />Accepted async jobs are never duplicated during fallback.</p>
      </form>
    </Card>
    <div className="grid min-h-[540px] gap-4"><Message error={error} />{result ? <Card className="!p-3" title={<span className="flex items-center gap-2 px-2"><ImageIcon size={15} className="text-[hsl(var(--claw-accent))]" />Creative output</span>} actions={<span className="rounded-sm bg-[hsl(var(--claw-accent))]/10 px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-[hsl(var(--claw-accent))]">{result.provider} · {result.status}</span>}>
      {src ? <img src={src} alt="Generated marketing creative" className="max-h-[42rem] w-full rounded-lg border border-border bg-background object-contain" /> : <div className="signal-grid grid min-h-[420px] place-items-center rounded-lg border border-border"><div className="text-center"><Loader2 size={24} className="mx-auto mb-3 animate-spin text-[hsl(var(--claw-accent))]" /><p className="text-sm text-muted-foreground">Job accepted and processing</p><code className="mt-2 block text-xs">{result.jobId}</code></div></div>}
      {result.failures.length > 0 && <details className="mx-2 mt-3"><summary className="cursor-pointer text-xs text-muted-foreground">Fallback diagnostics</summary><ul className="mt-2 grid gap-1 text-xs text-muted-foreground">{result.failures.map((f) => <li key={f.provider}>{f.provider}: {f.reason}</li>)}</ul></details>}
    </Card> : <EmptyOutput icon={ImageIcon} title="Creative canvas" text="Your generated image will land here with its actual provider, status, and fallback trail—no mystery routing." />}</div>
  </div>;
}

function DistributeView() {
  const [toolkit, setToolkit] = useState("instagram"); const [slug, setSlug] = useState(""); const [args, setArgs] = useState("{}");
  const [result, setResult] = useState<unknown>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null); setResult(null);
    try { setResult((await jsonRequest<{ result: unknown }>("/api/mktn/composio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ toolkit, slug, args: JSON.parse(args) }) })).result); }
    catch (e) { setError(e instanceof Error ? e.message : "Distribution failed."); } finally { setBusy(false); }
  }
  return <div className="grid gap-4 lg:grid-cols-[.85fr_1.15fr]">
    <Card title={<span className="flex items-center gap-2"><Workflow size={15} className="text-[hsl(var(--claw-accent))]" />Composio action</span>}>
      <p className="mb-5 text-sm leading-6 text-muted-foreground">Execute a connected tool with its exact toolkit, action slug, and arguments. Claw shares the same connection mesh.</p>
      <form className="grid gap-4" onSubmit={submit}>
        <Labeled label="Toolkit"><Input required value={toolkit} onChange={(e) => setToolkit(e.target.value)} placeholder="instagram" /></Labeled>
        <Labeled label="Action slug"><Input required value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="INSTAGRAM_CREATE_POST" /></Labeled>
        <Labeled label="Arguments JSON"><textarea required value={args} onChange={(e) => setArgs(e.target.value)} className="min-h-44 w-full rounded-md border border-border bg-background/60 p-3.5 font-mono text-xs leading-6 outline-none focus:border-[hsl(var(--claw-accent))]/60 focus:ring-2 focus:ring-[hsl(var(--claw-accent))]/10" /></Labeled>
        <div className="grid gap-2 sm:grid-cols-2"><Button type="submit" disabled={busy}>{busy ? <Loader2 size={15} className="mr-2 animate-spin" /> : <Zap size={15} className="mr-2" />}Run action</Button><Button asChild type="button" variant="secondary"><Link href="/integrations">Connections <ExternalLink size={13} className="ml-2" /></Link></Button></div>
      </form>
    </Card>
    <div className="grid min-h-[430px] gap-4"><Message error={error} />{result !== null ? <Card title="Composio response"><pre className="max-h-[38rem] overflow-auto whitespace-pre-wrap font-mono text-xs leading-6 text-muted-foreground">{JSON.stringify(result, null, 2)}</pre></Card> : <EmptyOutput icon={Share2} title="Distribution console" text="The exact response from Composio will appear here. Nothing is posted until you deliberately run the action." />}</div>
  </div>;
}

function SettingsView() {
  const [providers, setProviders] = useState<ProviderState | null>(null); const [composio, setComposio] = useState(false);
  const [keys, setKeys] = useState<Record<Provider, string>>({ nvidia: "", hedra: "", gemini: "", a2e: "" });
  const [busy, setBusy] = useState<string | null>(null); const [message, setMessage] = useState<string | null>(null); const [error, setError] = useState<string | null>(null);
  async function load() { const data = await jsonRequest<{ providers: ProviderState; composio: { configured: boolean } }>("/api/mktn/settings"); setProviders(data.providers); setComposio(data.composio.configured); }
  useEffect(() => { load().catch((e) => setError(e.message)); }, []);
  async function update(provider: Provider, clear = false) {
    setBusy(provider); setError(null); setMessage(null);
    try { const data = await jsonRequest<{ providers: ProviderState }>("/api/mktn/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(clear ? { provider, clear: true } : { provider, apiKey: keys[provider] }) }); setProviders(data.providers); setKeys({ ...keys, [provider]: "" }); setMessage(`${providerMeta[provider].label} ${clear ? "saved key cleared" : "key saved"}.`); }
    catch (e) { setError(e instanceof Error ? e.message : "Settings update failed."); } finally { setBusy(null); }
  }
  return <div className="grid gap-4">
    <Card title={<span className="flex items-center gap-2"><KeyRound size={15} className="text-[hsl(var(--claw-accent))]" />Provider vault</span>} actions={<span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-[hsl(var(--success))]"><ShieldCheck size={12} />server encrypted</span>}>
      <p className="mb-6 max-w-3xl text-sm leading-6 text-muted-foreground">Keys are encrypted server-side, never returned to the browser, and can fall back to environment configuration. Saving a new value replaces only that provider.</p>
      <div className="grid gap-3 xl:grid-cols-2">
        {(Object.keys(providerMeta) as Provider[]).map((provider) => {
          const state = providers?.[provider];
          return <div key={provider} className="rounded-lg border border-border bg-background/40 p-4 transition hover:border-[hsl(var(--border-strong))]">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex gap-3"><span className={`grid h-9 w-9 place-items-center rounded-md border font-mono text-[9px] ${state?.configured ? "border-[hsl(var(--success))]/30 bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]" : "border-border text-muted-foreground"}`}>{providerMeta[provider].order}</span><div><div className="text-sm font-semibold">{providerMeta[provider].label}</div><div className="mt-0.5 text-[10px] text-muted-foreground">{providerMeta[provider].role}</div></div></div>
              {state?.configured ? <span className="flex items-center gap-1 rounded-sm bg-[hsl(var(--success))]/10 px-2 py-1 font-mono text-[8px] uppercase tracking-wider text-[hsl(var(--success))]"><Check size={10} />{state.source}</span> : <span className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground">empty</span>}
            </div>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]"><Input type="password" autoComplete="new-password" value={keys[provider]} onChange={(e) => setKeys({ ...keys, [provider]: e.target.value })} placeholder="Paste new API key" aria-label={`${providerMeta[provider].label} API key`} /><Button size="sm" onClick={() => void update(provider)} disabled={busy === provider || !keys[provider].trim()}>{busy === provider ? <Loader2 size={13} className="animate-spin" /> : <KeyRound size={13} className="mr-1" />}Save</Button><Button size="sm" variant="ghost" onClick={() => void update(provider, true)} disabled={busy === provider || state?.source !== "saved"}>Clear</Button></div>
          </div>;
        })}
      </div>
    </Card>
    <Message error={error} success={message} />
    <Card title={<span className="flex items-center gap-2"><Workflow size={15} className="text-[hsl(var(--claw-accent))]" />Composio mesh</span>}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><span className={`signal-dot ${composio ? "" : "!bg-muted-foreground !shadow-none"}`} /><div><div className="text-sm font-semibold">{composio ? "Connection online" : "Connection required"}</div><p className="mt-1 text-xs text-muted-foreground">{composio ? "Connected and shared with MKTN + Claw." : "Connect Composio to activate external toolkits."}</p></div></div><Button asChild variant="secondary"><Link href="/integrations">Open Integrations <ExternalLink size={13} className="ml-2" /></Link></Button></div>
    </Card>
  </div>;
}

function EmptyOutput({ icon: Icon, title, text }: { icon: typeof ImageIcon; title: string; text: string }) {
  return <div className="signal-panel signal-grid grid min-h-full place-items-center rounded-xl p-8 text-center"><div className="max-w-sm"><div className="mx-auto grid h-12 w-12 place-items-center rounded-lg border border-[hsl(var(--claw-accent))]/25 bg-[hsl(var(--claw-accent))]/10 text-[hsl(var(--claw-accent))]"><Icon size={19} /></div><h3 className="mt-5 text-lg font-semibold tracking-tight">{title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p></div></div>;
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) { return <label className="grid gap-2 text-sm"><span className="signal-label !text-foreground">{label}</span>{children}</label>; }
function Select({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: string[] }) { return <select value={value} onChange={(e) => onChange(e.target.value)} className="h-11 w-full rounded-md border border-border bg-background/60 px-3.5 text-sm capitalize outline-none transition hover:border-[hsl(var(--border-strong))] focus:border-[hsl(var(--claw-accent))]/60 focus:ring-2 focus:ring-[hsl(var(--claw-accent))]/10">{options.map((option) => <option key={option} value={option}>{option}</option>)}</select>; }
function Message({ error, success }: { error?: string | null; success?: string | null }) { if (!error && !success) return null; return <div role={error ? "alert" : "status"} className={`flex items-center gap-2 rounded-md border p-3 text-sm ${error ? "border-[hsl(var(--danger))]/30 bg-[hsl(var(--danger))]/10 text-[hsl(var(--danger))]" : "border-[hsl(var(--success))]/30 bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]"}`}>{error ? <AlertCircle size={15} /> : <CheckCircle2 size={15} />}{error || success}</div>; }
