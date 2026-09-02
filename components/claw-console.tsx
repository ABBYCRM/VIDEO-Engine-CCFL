"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Bird, Copy, FilePlus2, FolderOpen, LogOut, Menu, Moon, PanelLeftClose,
  Paperclip, Pencil, Plug, Plus, Send, Sparkles, Square, Sun, Trash2, X
} from "lucide-react";
import { AuthGuard } from "@/components/auth-guard";
import AILoader from "@/components/ui/ai-loader";
import { ModelSelectorKit, type AiModel } from "@/components/ui/ai-model-select";

type Conv = { id: string; title: string; createdAt: string; updatedAt: string };
type Msg = { id: string; role: "user" | "assistant" | "tool" | "system"; content: string; toolJson?: any; createdAt: string };
type ClawFile = { id: string; name: string; mime: string; size: number; url: string };
type ToolChip = { name: string; ok?: boolean; via?: string; preview?: string; running?: boolean; decision?: "DEFER" | "REJECT" };
type Theme = "light" | "dark";

type Suggestion = { label: string; prompt: string; source: "tool" | "rag" | "category"; category?: string; skillIds?: string[] };

// The Claw "starter" prompts are RAG-driven: a /api/claw/suggestions
// endpoint walks the dev-skills corpus and returns both tool-driven
// prompts (each maps to a real Claw tool) and RAG-driven prompts
// (each opens a record from the curated dev knowledge). The component
// fetches on mount, caches in state, and renders the buttons; if the
// fetch fails (or before it resolves) the inline DEFAULT_SUGGESTIONS
// below stand in.
const DEFAULT_SUGGESTIONS: Suggestion[] = [
  { label: "Research a public URL with Steel", prompt: "Use steel_scrape on https://caseclosedfl.com and summarize what the operator's PI site actually says.", source: "tool" },
  { label: "List dev skills RAG", prompt: "Run dev_skill_list so I can browse the curated knowledge base.", source: "tool" },
  { label: "Find a skill by id", prompt: "Call dev_skill_get for 'sql.like-escape' and show me the body verbatim.", source: "tool" }
];

function sseParse(chunk: string, onEvent: (e: any) => void, carry: { buf: string }) {
  carry.buf += chunk;
  const parts = carry.buf.split("\n\n");
  carry.buf = parts.pop() || "";
  for (const part of parts) {
    const line = part.split("\n").find((l) => l.startsWith("data:"));
    if (!line) continue;
    try { onEvent(JSON.parse(line.slice(5).trim())); } catch { /* ignore */ }
  }
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function ClawConsole() {
  const router = useRouter();
  const [convs, setConvs] = useState<Conv[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [files, setFiles] = useState<ClawFile[]>([]);
  const [text, setText] = useState("");
  const [pendingFiles, setPendingFiles] = useState<ClawFile[]>([]);
  const [streaming, setStreaming] = useState("");
  const [tools, setTools] = useState<ToolChip[]>([]);
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>(DEFAULT_SUGGESTIONS);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const [models, setModels] = useState<{ id: string; label: string; notes: string; contextWindow: number }[]>([]);
  const [model, setModel] = useState<string | null>(null);
  const [modelEnvOverridden, setModelEnvOverridden] = useState(false);
  const [modelSaving, setModelSaving] = useState(false);
  const [theme, setTheme] = useState<Theme>("dark");
  const scroller = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  // Theme: hydrate from storage / system, then keep html[data-claw-theme]
  // in sync so the model-picker popup (portaled to <body>) inherits it too.
  useEffect(() => {
    const saved = (typeof localStorage !== "undefined" && localStorage.getItem("claw-theme")) as Theme | null;
    const initial: Theme = saved === "light" || saved === "dark"
      ? saved
      : (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    setTheme(initial);
  }, []);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.clawTheme = theme;
    try { localStorage.setItem("claw-theme", theme); } catch { /* ignore */ }
    return () => { delete root.dataset.clawTheme; };
  }, [theme]);

  const loadConvs = useCallback(async () => {
    const r = await fetch("/api/claw/conversations");
    if (!r.ok) return;
    const d = await r.json();
    setConvs(d.conversations || []);
  }, []);

  const loadThread = useCallback(async (id: string) => {
    const [m, f] = await Promise.all([
      fetch(`/api/claw/conversations/${id}`),
      fetch(`/api/claw/files?conversationId=${id}`)
    ]);
    if (m.ok) {
      const d = await m.json();
      setMessages((d.messages || []).filter((x: Msg) => x.role !== "system"));
    }
    if (f.ok) {
      const d = await f.json();
      setFiles(d.files || []);
    }
  }, []);

  useEffect(() => { void loadConvs(); }, [loadConvs]);
  useEffect(() => { if (active) void loadThread(active); }, [active, loadThread]);
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }); }, [messages, streaming, tools]);
  useEffect(() => {
    // RAG-driven starter prompts. Fetches on mount; on failure keeps defaults.
    let cancelled = false;
    fetch("/api/claw/suggestions", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d || !Array.isArray(d.suggestions)) return;
        if (d.suggestions.length > 0) setSuggestions(d.suggestions);
      })
      .catch(() => { /* keep defaults */ });
    return () => { cancelled = true; };
  }, []);

  const loadModel = useCallback(async () => {
    try {
      const r = await fetch("/api/claw/model", { cache: "no-store" });
      if (!r.ok) return;
      const d = await r.json();
      setModels(d.models || []);
      setModel(d.model);
      setModelEnvOverridden(Boolean(d.envOverridden));
    } catch { /* keep whatever we had */ }
  }, []);
  useEffect(() => { void loadModel(); }, [loadModel]);

  // Auto-grow the composer textarea like Claude's.
  useEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = Math.min(el.scrollHeight, 220) + "px";
  }, [text]);

  async function changeModel(next: string) {
    if (modelEnvOverridden || modelSaving || next === model) return;
    setModelSaving(true);
    const prev = model;
    setModel(next);
    try {
      const r = await fetch("/api/claw/model", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: next }) });
      if (!r.ok) { setModel(prev); const d = await r.json().catch(() => ({})); setError(d.error || "Failed to change model"); }
    } catch (e) {
      setModel(prev);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setModelSaving(false);
    }
  }

  const aiModels: AiModel[] = useMemo(
    () => models.map((m) => ({
      id: m.id,
      label: m.label,
      description: m.notes,
      contexts: [m.contextWindow]
    })),
    [models]
  );

  async function newThread() {
    const r = await fetch("/api/claw/conversations", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    const d = await r.json();
    setActive(d.conversation.id);
    setMessages([]);
    setStreaming("");
    setTools([]);
    setPendingFiles([]);
    setSidebarOpen(false);
    await loadConvs();
  }

  async function removeThread(id: string) {
    if (!confirm("Delete this thread and its messages?")) return;
    await fetch(`/api/claw/conversations/${id}`, { method: "DELETE" });
    if (active === id) { setActive(null); setMessages([]); }
    await loadConvs();
  }

  async function removeMessage(id: string) {
    if (!active) return;
    await fetch(`/api/claw/conversations/${active}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ deleteMessageId: id }) });
    await loadThread(active);
  }

  async function upload(list: FileList | null) {
    if (!list?.length) return;
    setError(null);
    const uploaded: ClawFile[] = [];
    for (const file of Array.from(list)) {
      const form = new FormData();
      form.append("file", file);
      if (active) form.append("conversationId", active);
      const r = await fetch("/api/claw/files", { method: "POST", body: form });
      const d = await r.json();
      if (!r.ok) { setError(d.error || "Upload failed"); continue; }
      uploaded.push(d.file);
    }
    setPendingFiles((prev) => [...prev, ...uploaded]);
    if (active) await loadThread(active);
    else setFiles((prev) => [...uploaded, ...prev]);
  }

  async function removeFile(id: string) {
    await fetch(`/api/claw/files/${id}`, { method: "DELETE" });
    setPendingFiles((prev) => prev.filter((f) => f.id !== id));
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }

  async function saveRename(id: string) {
    await fetch(`/api/claw/files/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: renameVal }) });
    setRenameId(null);
    if (active) await loadThread(active);
    else await loadConvs();
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/login");
  }

  async function send(overrideText?: string) {
    if (busy) return;

    const body = (overrideText ?? text).trim();
    if (!body && !pendingFiles.length) return;
    setBusy(true); setError(null); setStreaming(""); setTools([]);
    const ac = new AbortController();
    abortRef.current = ac;
    let convId = active;
    if (!convId) {
      const r = await fetch("/api/claw/conversations", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const d = await r.json();
      convId = d.conversation.id;
      setActive(convId);
    }
    const optimistic: Msg = { id: "local-user", role: "user", content: body, createdAt: new Date().toISOString() };
    setMessages((m) => [...m, optimistic]);
    // Only clear the box for a normal send — a caller passing overrideText
    // sends its own text without touching whatever draft was being typed.
    if (overrideText === undefined) setText("");
    const fileIds = pendingFiles.map((f) => f.id);
    setPendingFiles([]);
    try {
      const r = await fetch("/api/claw/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId: convId, text: body, fileIds }),
        signal: ac.signal
      });
      if (!r.ok || !r.body) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || `HTTP ${r.status}`);
      }
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      const carry = { buf: "" };
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        sseParse(decoder.decode(value, { stream: true }), (e) => {
          if (e.type === "token") setStreaming((s) => s + e.text);
          if (e.type === "tool_start") setTools((t) => [...t, { name: e.name, running: true }]);
          if (e.type === "tool_end") setTools((t) => t.map((x) => x.name === e.name && x.running ? { ...x, running: false, ok: e.ok, via: e.via, preview: e.preview, decision: e.decision } : x));
          if (e.type === "error") setError(e.error);
          if (e.type === "done") setStreaming("");
        }, carry);
      }
      if (convId) await loadThread(convId);
      await loadConvs();
    } catch (e) {
      if ((e as any)?.name !== "AbortError") setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  function stop() { abortRef.current?.abort(); setBusy(false); }

  const visible = messages.filter((m) => (m.role === "user" || m.role === "assistant") && !(m.role === "assistant" && m.toolJson));
  const empty = !visible.length && !streaming && !busy;
  const activeTitle = convs.find((c) => c.id === active)?.title;

  function renderComposer(variant: "hero" | "docked") {
    return (
      <div className={variant === "hero" ? "w-full" : "mx-auto w-full max-w-3xl px-3 sm:px-4"}>
        {error && (
          <div className="mb-2 rounded-xl border border-[hsl(var(--claw-accent))]/40 bg-[hsl(var(--claw-accent))]/10 px-3 py-2 text-sm text-[hsl(var(--foreground))]">
            {error}
          </div>
        )}
        <div className="rounded-[22px] border border-border bg-[hsl(var(--claw-elevated))] p-2 shadow-[0_1px_3px_rgba(0,0,0,0.06),0_8px_30px_-16px_rgba(0,0,0,0.25)] focus-within:border-[hsl(var(--claw-accent))]/60">
          {pendingFiles.length > 0 && (
            <div className="mb-1 flex flex-wrap gap-1.5 px-1.5 pt-1">
              {pendingFiles.map((f) => (
                <span key={f.id} className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted px-2 py-1 text-[11px] text-foreground">
                  <Paperclip size={11} className="text-muted-foreground" />
                  <span className="max-w-[140px] truncate">{f.name}</span>
                  <button type="button" onClick={() => setPendingFiles((p) => p.filter((x) => x.id !== f.id))} aria-label={`Remove ${f.name}`} className="text-muted-foreground hover:text-foreground"><X size={11} /></button>
                </span>
              ))}
            </div>
          )}
          <textarea
            ref={variant === "docked" ? textarea : undefined}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !(e.nativeEvent as any).isComposing && (e.nativeEvent as any).keyCode !== 229) {
                e.preventDefault();
                void send();
              }
            }}
            rows={variant === "hero" ? 2 : 1}
            placeholder="Ask Claw to research, generate, post, read comments or DMs…"
            className="block max-h-[220px] w-full resize-none bg-transparent px-3 py-2 text-[15px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
          />
          <div className="flex items-center justify-between gap-2 px-1 pt-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                aria-label="Attach files"
                className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Paperclip size={17} />
              </button>
              <div className="flex min-w-0 max-w-[calc(100vw-7.5rem)] sm:max-w-[420px] [&_[data-slot=model-selector-trigger]]:max-w-full">
                <ModelSelectorKit
                  aria-label={modelEnvOverridden ? "Model is fixed by the CLAW_NVIDIA_MODEL environment variable" : "Choose the NVIDIA model Claw uses"}
                  className="min-w-0 max-w-full"
                  models={aiModels}
                  value={model ? { id: model } : undefined}
                  onValueChange={(sel) => void changeModel(sel.id)}
                  disabled={!models.length || modelEnvOverridden || modelSaving}
                  side={variant === "hero" ? "bottom" : "top"}
                />
              </div>
            </div>
            {busy ? (
              <button
                type="button"
                onClick={stop}
                aria-label="Stop generating"
                className="grid h-9 w-9 place-items-center rounded-full bg-foreground text-background transition-transform active:scale-95"
              >
                <Square size={15} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void send()}
                disabled={!text.trim() && !pendingFiles.length}
                aria-label="Send message"
                className="grid h-9 w-9 place-items-center rounded-full bg-[hsl(var(--claw-accent))] text-[hsl(var(--claw-accent-fg))] transition-colors hover:bg-[hsl(var(--claw-accent-hover))] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Send size={16} />
              </button>
            )}
          </div>
        </div>
        {modelEnvOverridden && (
          <div className="mt-1.5 px-1 text-center text-[11px] text-muted-foreground">Model is pinned by CLAW_NVIDIA_MODEL.</div>
        )}
      </div>
    );
  }

  return (
    <AuthGuard>
      <div className="claw-shell flex h-[100dvh] overflow-hidden bg-background text-foreground">
        <input ref={fileInput} type="file" className="hidden" multiple onChange={(e) => { void upload(e.target.files); e.target.value = ""; }} />

        {/* Sidebar */}
        {sidebarOpen && (
          <button type="button" aria-label="Close sidebar" onClick={() => setSidebarOpen(false)} className="fixed inset-0 z-30 bg-black/40 md:hidden" />
        )}
        <aside
          className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-border bg-[hsl(var(--claw-sidebar))] transition-transform duration-200 md:static md:z-auto md:w-64 md:translate-x-0 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between px-3 py-3">
            <Link href="/claw" className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-[hsl(var(--claw-accent))] text-[hsl(var(--claw-accent-fg))]"><Bird size={17} /></span>
              <span className="text-[15px] font-semibold tracking-tight">Claw</span>
            </Link>
            <button type="button" onClick={() => setSidebarOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted md:hidden" aria-label="Close sidebar">
              <PanelLeftClose size={16} />
            </button>
          </div>

          <div className="px-3 pb-2">
            <button
              type="button"
              onClick={newThread}
              className="flex w-full items-center gap-2 rounded-xl border border-border bg-[hsl(var(--claw-elevated))] px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-[hsl(var(--claw-accent))]/50"
            >
              <Plus size={16} className="text-[hsl(var(--claw-accent))]" />
              New chat
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2">
            <div className="px-2 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Recents</div>
            {convs.map((c) => (
              <div key={c.id} className={`group mb-0.5 flex items-center gap-1 rounded-lg px-2 py-2 text-sm transition-colors ${active === c.id ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"}`}>
                <button type="button" className="min-w-0 flex-1 truncate text-left" onClick={() => { setActive(c.id); setSidebarOpen(false); }}>{c.title}</button>
                <button type="button" className="hidden h-6 w-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-[hsl(var(--claw-accent))]/15 hover:text-[hsl(var(--claw-accent))] group-hover:grid" onClick={() => removeThread(c.id)} aria-label="Delete thread"><Trash2 size={12} /></button>
              </div>
            ))}
            {!convs.length && <div className="px-2 py-6 text-center text-xs text-muted-foreground">No conversations yet.</div>}
          </div>

          <div className="border-t border-border p-2">
            <Link href="/integrations" className="mb-1 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground">
              <Plug size={16} />
              Integrations
            </Link>
            <div className="flex items-center gap-2 rounded-lg px-2 py-1.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[hsl(var(--claw-accent))] text-xs font-semibold text-[hsl(var(--claw-accent-fg))]">A</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium">Admin</div>
                <div className="truncate text-[11px] text-muted-foreground">Claw operator</div>
              </div>
              <button type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}>
                {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
              </button>
              <button type="button" onClick={logout} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Sign out">
                <LogOut size={15} />
              </button>
            </div>
          </div>
        </aside>

        {/* Main column */}
        <main className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3 sm:px-4">
            <button type="button" onClick={() => setSidebarOpen(true)} className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted md:hidden" aria-label="Open sidebar">
              <Menu size={18} />
            </button>
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Bird size={15} className="shrink-0 text-[hsl(var(--claw-accent))]" />
              <span className="truncate text-sm font-medium">{activeTitle || "New chat"}</span>
            </div>
            <button
              type="button"
              onClick={() => setFilesOpen((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${filesOpen ? "border-[hsl(var(--claw-accent))]/50 bg-[hsl(var(--claw-accent))]/10 text-foreground" : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"}`}
            >
              <FolderOpen size={14} />
              Files
            </button>
          </header>

          <div className="flex min-h-0 flex-1">
            <section className="flex min-w-0 flex-1 flex-col">
              {empty ? (
                <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-4 py-8">
                  <div className="w-full max-w-3xl">
                    <div className="mb-6 flex items-center justify-center gap-3">
                      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[hsl(var(--claw-accent))] text-[hsl(var(--claw-accent-fg))]"><Bird size={24} /></span>
                      <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{greeting()}, operator</h1>
                    </div>
                    {renderComposer("hero")}
                    <div className="mt-5 flex flex-wrap justify-center gap-2">
                      {suggestions.slice(0, 6).map((s, i) => (
                        <button
                          key={`${s.source}-${s.skillIds?.[0] || s.label}-${i}`}
                          type="button"
                          title={s.source === "rag" && s.skillIds ? `From dev-skill: ${s.skillIds.join(", ")}` : s.source === "tool" ? "Calls a real Claw tool" : "Starter"}
                          className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-[hsl(var(--claw-elevated))] px-3.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-[hsl(var(--claw-accent))]/50 hover:text-foreground"
                          onClick={() => { setText(s.prompt); textarea.current?.focus(); }}
                        >
                          {s.source === "rag" ? <Sparkles size={11} className="shrink-0 text-[hsl(var(--claw-accent))]" /> : null}
                          <span className="max-w-[240px] truncate sm:max-w-[280px]">{s.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
                    <div className="mx-auto flex max-w-3xl flex-col gap-6">
                      {visible.map((m) => (
                        m.role === "user" ? (
                          <div key={m.id} className="group flex flex-col items-end gap-1">
                            <div className="max-w-[85%] rounded-2xl rounded-br-md bg-[hsl(var(--claw-bubble))] px-4 py-2.5 text-[15px] leading-relaxed text-foreground">
                              <div className="whitespace-pre-wrap break-words">{m.content}</div>
                            </div>
                            <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                              <button type="button" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => navigator.clipboard.writeText(m.content)} aria-label="Copy message"><Copy size={12} /></button>
                              <button type="button" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => removeMessage(m.id)} aria-label="Delete message"><Trash2 size={12} /></button>
                            </div>
                          </div>
                        ) : (
                          <div key={m.id} className="group flex flex-col gap-1">
                            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                              <span className="grid h-6 w-6 place-items-center rounded-lg bg-[hsl(var(--claw-accent))]/15 text-[hsl(var(--claw-accent))]"><Bird size={13} /></span>
                              Claw
                            </div>
                            <div className="whitespace-pre-wrap break-words pl-8 text-[15px] leading-relaxed text-foreground">{m.content}</div>
                            <div className="flex gap-1 pl-8 opacity-0 transition-opacity group-hover:opacity-100">
                              <button type="button" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => navigator.clipboard.writeText(m.content)} aria-label="Copy message"><Copy size={12} /></button>
                              <button type="button" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => removeMessage(m.id)} aria-label="Delete message"><Trash2 size={12} /></button>
                            </div>
                          </div>
                        )
                      ))}

                      {tools.map((t, i) => {
                        // A DEFER/REJECT is Claw deliberately pausing for the
                        // operator's confirmation, not a failure.
                        const label = t.running
                          ? "Running"
                          : t.decision === "DEFER"
                            ? "Needs confirmation:"
                            : t.decision === "REJECT"
                              ? "Blocked:"
                              : t.ok ? "Did" : "Failed";
                        const isPause = t.decision === "DEFER" || t.decision === "REJECT";
                        return (
                          <div key={`${t.name}-${i}`} className="ml-8 rounded-xl border border-border bg-[hsl(var(--claw-elevated))] px-3 py-2 text-xs text-foreground">
                            <div className="flex items-center gap-2">
                              {t.running ? <AILoader variant="dots" className="text-[hsl(var(--claw-accent))]" /> : <span className={`h-1.5 w-1.5 rounded-full ${isPause ? "bg-[hsl(var(--info))]" : t.ok ? "bg-[hsl(var(--success))]" : "bg-[hsl(var(--danger))]"}`} />}
                              <span className="font-semibold">{label} {t.name}</span>
                              {t.via ? <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">via {t.via}</span> : null}
                            </div>
                            {t.preview ? <div className="mt-1.5 line-clamp-3 font-mono text-[11px] text-muted-foreground">{t.preview}</div> : null}
                          </div>
                        );
                      })}

                      {streaming && (
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                            <span className="grid h-6 w-6 place-items-center rounded-lg bg-[hsl(var(--claw-accent))]/15 text-[hsl(var(--claw-accent))]"><Bird size={13} /></span>
                            Claw
                          </div>
                          <div className="whitespace-pre-wrap break-words pl-8 text-[15px] leading-relaxed text-foreground">
                            {streaming}<span className="ml-0.5 inline-block h-4 w-[3px] translate-y-0.5 animate-pulse bg-[hsl(var(--claw-accent))]" />
                          </div>
                        </div>
                      )}

                      {busy && !streaming && (
                        <div className="flex items-center gap-2 pl-0">
                          <span className="grid h-6 w-6 place-items-center rounded-lg bg-[hsl(var(--claw-accent))]/15 text-[hsl(var(--claw-accent))]"><Bird size={13} /></span>
                          <AILoader label="Thinking" showElapsed variant="dots" className="text-muted-foreground" />
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 pb-4 pt-2">
                    {renderComposer("docked")}
                    <div className="mx-auto mt-2 max-w-3xl px-4 text-center text-[11px] text-muted-foreground">
                      Claw can call real tools and post to live accounts. Review actions before confirming.
                    </div>
                  </div>
                </>
              )}
            </section>

            {/* Files drawer */}
            {filesOpen && (
              <button type="button" aria-label="Close files" onClick={() => setFilesOpen(false)} className="fixed inset-0 z-30 bg-black/40 lg:hidden" />
            )}
            <aside className={`${filesOpen ? "flex" : "hidden"} fixed inset-y-0 right-0 z-40 w-80 max-w-[85vw] flex-col border-l border-border bg-[hsl(var(--claw-sidebar))] lg:static lg:z-auto lg:w-80`}>
              <div className="flex items-center justify-between border-b border-border px-3 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Files</div>
                <div className="flex items-center gap-1">
                  <button type="button" className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => fileInput.current?.click()} aria-label="Add file"><FilePlus2 size={14} /></button>
                  <button type="button" className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => setFilesOpen(false)} aria-label="Close files"><X size={15} /></button>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-2">
                {files.map((f) => (
                  <div key={f.id} className="mb-2 rounded-xl border border-border bg-[hsl(var(--claw-elevated))] p-2.5 text-xs">
                    {renameId === f.id ? (
                      <div className="flex gap-1">
                        <input className="h-8 flex-1 rounded-lg border border-border bg-background px-2 text-foreground outline-none focus:border-[hsl(var(--claw-accent))]" value={renameVal} onChange={(e) => setRenameVal(e.target.value)} />
                        <button type="button" className="rounded-lg bg-[hsl(var(--claw-accent))] px-3 text-[hsl(var(--claw-accent-fg))]" onClick={() => void saveRename(f.id)}>Save</button>
                      </div>
                    ) : (
                      <>
                        <a href={f.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 font-medium text-[hsl(var(--claw-accent))] hover:underline">
                          <FolderOpen size={12} />{f.name}
                        </a>
                        <div className="mt-1 text-[10px] text-muted-foreground">{f.mime} · {(f.size / 1024).toFixed(1)} KB</div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          <button type="button" className="rounded-md border border-border px-2 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => setPendingFiles((p) => p.some((x) => x.id === f.id) ? p : [...p, f])}>Attach</button>
                          <button type="button" className="rounded-md border border-border px-2 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => { setRenameId(f.id); setRenameVal(f.name); }}><Pencil size={10} className="mr-0.5 inline" />Rename</button>
                          <button type="button" className="rounded-md border border-[hsl(var(--danger))]/40 px-2 py-0.5 text-[hsl(var(--danger))] hover:bg-[hsl(var(--danger))]/10" onClick={() => void removeFile(f.id)}>Delete</button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
                {!files.length && <div className="px-2 py-8 text-center text-xs text-muted-foreground">Upload briefs, scripts, stills. Claw can read them and attach them to a message.</div>}
              </div>
              {busy && <div className="border-t border-border px-3 py-2"><AILoader label="Working" variant="bar" className="text-xs text-muted-foreground" /></div>}
            </aside>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
