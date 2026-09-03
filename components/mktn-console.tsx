"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertCircle, BookOpen, CheckCircle2, ExternalLink, Image as ImageIcon, KeyRound, Loader2, Route, Search, Settings, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type View = "guide" | "plan" | "generate" | "distribute" | "settings";
type Provider = "nvidia" | "hedra" | "gemini" | "a2e";
type ProviderState = Record<Provider, { configured: boolean; source: "saved" | "environment" | "none" }>;
type Guide = { name: string; definition: string; category: string; aliases: string[]; when: string; where: string; how: string; why: string; caution?: string };

const views: Array<{ id: View; label: string; icon: typeof BookOpen }> = [
  { id: "guide", label: "Guide", icon: BookOpen },
  { id: "plan", label: "Plan", icon: Route },
  { id: "generate", label: "Generate", icon: ImageIcon },
  { id: "distribute", label: "Distribute", icon: Share2 },
  { id: "settings", label: "Settings", icon: Settings },
];

const providerMeta: Record<Provider, { label: string; role: string }> = {
  nvidia: { label: "NVIDIA NIM", role: "Fast campaign reasoning" },
  hedra: { label: "Hedra", role: "Primary image provider" },
  gemini: { label: "Gemini", role: "First image fallback" },
  a2e: { label: "A2E", role: "Final image fallback" },
};

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data as T;
}

export function MktnConsole() {
  const [view, setView] = useState<View>("guide");
  return (
    <div className="pb-12">
      <div className="mb-5 overflow-x-auto border-b border-border">
        <nav className="flex min-w-max gap-1" aria-label="MKTN sections">
          {views.map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            return (
              <button key={item.id} type="button" onClick={() => setView(item.id)} aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium transition ${active ? "border-[hsl(var(--claw-accent))] text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                <Icon size={16} />{item.label}
              </button>
            );
          })}
        </nav>
      </div>
      {view === "guide" && <GuideView />}
      {view === "plan" && <PlanView />}
      {view === "generate" && <GenerateView />}
      {view === "distribute" && <DistributeView />}
      {view === "settings" && <SettingsView />}
    </div>
  );
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
  return <div className="grid gap-4">
    <Card>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void search(); }}>
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search VSL, CAC, positioning…" aria-label="Search marketing terminology" />
        <Button type="submit" disabled={busy}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}<span className="ml-2 hidden sm:inline">Search</span></Button>
      </form>
      <p className="mt-2 text-xs text-muted-foreground">Search by term, acronym, or definition. Every result explains when, where, how, and why to use it.</p>
    </Card>
    <Message error={error} />
    {terms.map((term) => <Card key={`${term.category}:${term.name}`}>
      <div className="mb-3 flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold">{term.name}</h2><span className="rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground">{term.category}</span></div>
      <p className="mb-4 text-sm text-muted-foreground">{term.definition}</p>
      <dl className="grid gap-3 sm:grid-cols-2">
        {[["When", term.when], ["Where", term.where], ["How", term.how], ["Why", term.why]].map(([label, value]) => <div key={label} className="rounded-xl border border-border p-3"><dt className="mb-1 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--claw-accent))]">{label}</dt><dd className="text-sm leading-relaxed">{value}</dd></div>)}
      </dl>
      {term.caution && <p className="mt-3 flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm"><AlertCircle size={16} className="mt-0.5 shrink-0" />{term.caution}</p>}
    </Card>)}
    {!busy && !error && terms.length === 0 && <Card className="text-sm text-muted-foreground">No matching terms.</Card>}
  </div>;
}

function PlanView() {
  const [form, setForm] = useState({ product: "", audience: "", goal: "sales", funnelStage: "conversion", channels: "Meta Ads, Instagram" });
  const [result, setResult] = useState<{ narrative: string; provider: string; warning?: string } | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null); setResult(null);
    try { setResult(await jsonRequest("/api/mktn/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, channels: form.channels.split(",").map((v) => v.trim()).filter(Boolean) }) })); }
    catch (e) { setError(e instanceof Error ? e.message : "Planning failed."); } finally { setBusy(false); }
  }
  return <div className="grid gap-4"><Card title="Campaign brief"><form className="grid gap-3" onSubmit={submit}>
    <Labeled label="Product"><Input required value={form.product} onChange={(e) => setForm({ ...form, product: e.target.value })} /></Labeled>
    <Labeled label="Audience"><Input required value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} /></Labeled>
    <div className="grid gap-3 sm:grid-cols-2"><Labeled label="Goal"><Select value={form.goal} onChange={(v) => setForm({ ...form, goal: v })} options={["awareness", "leads", "sales", "activation", "retention", "research", "measurement"]} /></Labeled><Labeled label="Funnel stage"><Select value={form.funnelStage} onChange={(v) => setForm({ ...form, funnelStage: v })} options={["awareness", "consideration", "conversion", "retention"]} /></Labeled></div>
    <Labeled label="Channels (comma-separated)"><Input required value={form.channels} onChange={(e) => setForm({ ...form, channels: e.target.value })} /></Labeled>
    <Button type="submit" disabled={busy}>{busy && <Loader2 size={16} className="mr-2 animate-spin" />}Build plan</Button>
  </form></Card><Message error={error} />{result && <Card title={`Plan · ${result.provider}`}><pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap text-sm leading-relaxed">{result.narrative}</pre>{result.warning && <p className="mt-3 text-xs text-amber-600">{result.warning}</p>}</Card>}</div>;
}

function GenerateView() {
  const [prompt, setPrompt] = useState(""); const [aspectRatio, setAspectRatio] = useState("1:1");
  const [result, setResult] = useState<{ provider: string; status: string; url?: string; dataUrl?: string; jobId?: string; failures: Array<{ provider: string; reason: string }> } | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null); setResult(null);
    try { setResult(await jsonRequest("/api/mktn/generate-image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, aspectRatio }) })); }
    catch (e) { setError(e instanceof Error ? e.message : "Generation failed."); } finally { setBusy(false); }
  }
  const src = result?.url || result?.dataUrl;
  return <div className="grid gap-4"><Card title="Image generation"><p className="mb-4 text-sm text-muted-foreground">Failover order: Hedra → Gemini → A2E. An accepted pending job never triggers a duplicate paid generation.</p><form className="grid gap-3" onSubmit={submit}>
    <Labeled label="Prompt"><textarea required maxLength={8000} value={prompt} onChange={(e) => setPrompt(e.target.value)} className="min-h-32 w-full rounded-xl border border-border bg-[hsl(var(--claw-elevated))] p-3 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--claw-accent))]/40" /></Labeled>
    <Labeled label="Aspect ratio"><Select value={aspectRatio} onChange={setAspectRatio} options={["1:1", "16:9", "9:16", "4:3", "3:4"]} /></Labeled>
    <Button type="submit" disabled={busy}>{busy && <Loader2 size={16} className="mr-2 animate-spin" />}Generate once</Button>
  </form></Card><Message error={error} />{result && <Card title={`${result.provider} · ${result.status}`}>
    {src ? <img src={src} alt="Generated marketing creative" className="max-h-[36rem] w-full rounded-xl object-contain" /> : <p className="text-sm text-muted-foreground">Job accepted and still processing. Job ID: <code>{result.jobId}</code></p>}
    {result.failures.length > 0 && <details className="mt-3"><summary className="cursor-pointer text-xs text-muted-foreground">Fallback diagnostics</summary><ul className="mt-2 grid gap-1 text-xs text-muted-foreground">{result.failures.map((f) => <li key={f.provider}>{f.provider}: {f.reason}</li>)}</ul></details>}
  </Card>}</div>;
}

function DistributeView() {
  const [toolkit, setToolkit] = useState("instagram"); const [slug, setSlug] = useState(""); const [args, setArgs] = useState("{}");
  const [result, setResult] = useState<unknown>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null); setResult(null);
    try { setResult((await jsonRequest<{ result: unknown }>("/api/mktn/composio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ toolkit, slug, args: JSON.parse(args) }) })).result); }
    catch (e) { setError(e instanceof Error ? e.message : "Distribution failed."); } finally { setBusy(false); }
  }
  return <div className="grid gap-4"><Card title="Composio action"><p className="mb-4 text-sm text-muted-foreground">Execute a connected Composio tool with its exact toolkit, action slug, and arguments. The same connection is available to Claw.</p><form className="grid gap-3" onSubmit={submit}>
    <Labeled label="Toolkit"><Input required value={toolkit} onChange={(e) => setToolkit(e.target.value)} placeholder="instagram" /></Labeled>
    <Labeled label="Action slug"><Input required value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="INSTAGRAM_CREATE_POST" /></Labeled>
    <Labeled label="Arguments JSON"><textarea required value={args} onChange={(e) => setArgs(e.target.value)} className="min-h-32 w-full rounded-xl border border-border bg-[hsl(var(--claw-elevated))] p-3 font-mono text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--claw-accent))]/40" /></Labeled>
    <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy}>{busy && <Loader2 size={16} className="mr-2 animate-spin" />}Run action</Button><Button asChild type="button" variant="secondary"><Link href="/integrations">Manage connections <ExternalLink size={14} className="ml-2" /></Link></Button></div>
  </form></Card><Message error={error} />{result !== null && <Card title="Composio response"><pre className="max-h-96 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(result, null, 2)}</pre></Card>}</div>;
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
  return <div className="grid gap-4"><Card title="Provider keys"><p className="mb-4 text-sm text-muted-foreground">Keys are encrypted server-side and are never returned to this page. Environment values remain valid fallbacks.</p><div className="grid gap-4">
    {(Object.keys(providerMeta) as Provider[]).map((provider) => <div key={provider} className="rounded-xl border border-border p-3"><div className="mb-2 flex items-center justify-between gap-3"><div><div className="font-medium">{providerMeta[provider].label}</div><div className="text-xs text-muted-foreground">{providerMeta[provider].role}</div></div>{providers?.[provider].configured ? <span className="flex items-center gap-1 text-xs text-emerald-600"><CheckCircle2 size={14} />{providers[provider].source}</span> : <span className="text-xs text-muted-foreground">not configured</span>}</div><div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]"><Input type="password" autoComplete="new-password" value={keys[provider]} onChange={(e) => setKeys({ ...keys, [provider]: e.target.value })} placeholder="Paste new API key" aria-label={`${providerMeta[provider].label} API key`} /><Button size="sm" onClick={() => void update(provider)} disabled={busy === provider || !keys[provider].trim()}>{busy === provider ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} className="mr-1" />}Save</Button><Button size="sm" variant="secondary" onClick={() => void update(provider, true)} disabled={busy === provider || providers?.[provider].source !== "saved"}>Clear saved</Button></div></div>)}
  </div></Card><Message error={error} success={message} /><Card title="Composio"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">{composio ? "Connected and shared with MKTN + Claw." : "Not configured. Connect Composio to distribute through external toolkits."}</p><Button asChild variant="secondary"><Link href="/integrations">Open Integrations <ExternalLink size={14} className="ml-2" /></Link></Button></div></Card></div>;
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) { return <label className="grid gap-1.5 text-sm"><span className="font-medium">{label}</span>{children}</label>; }
function Select({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: string[] }) { return <select value={value} onChange={(e) => onChange(e.target.value)} className="h-11 w-full rounded-xl border border-border bg-[hsl(var(--claw-elevated))] px-3 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--claw-accent))]/40">{options.map((option) => <option key={option} value={option}>{option}</option>)}</select>; }
function Message({ error, success }: { error?: string | null; success?: string | null }) { if (!error && !success) return null; return <div role={error ? "alert" : "status"} className={`flex items-center gap-2 rounded-xl border p-3 text-sm ${error ? "border-rose-500/30 bg-rose-500/10 text-rose-600" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"}`}>{error ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}{error || success}</div>; }
