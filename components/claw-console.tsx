"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Bot, ChevronRight, Copy, FilePlus2, Film, FolderOpen,
  Hash, Loader2, Menu, Moon, PanelLeftClose, Paperclip,
  Pencil, Plug, Plus, Search, Send, Settings, Sparkles, Square,
  Sun, Trash2, Wand2, X, Zap
} from "lucide-react";
import { AuthGuard } from "@/components/auth-guard";
import { ClawLogo } from "@/components/claw-logo";
import AILoader from "@/components/ui/ai-loader";
import { ClawThinkingPanel, type ToolNode } from "@/components/ui/claw-thinking-panel";


/* ─────────────────────────────────────────────────────────
 * TYPES
 * ───────────────────────────────────────────────────────── */
type Conv = { id: string; title: string; createdAt: string; updatedAt: string };
type Msg = { id: string; role: "user" | "assistant" | "tool" | "system"; content: string; toolJson?: any; createdAt: string };
type ClawFile = { id: string; name: string; mime: string; size: number; url: string };
type Theme = "light" | "dark";
type Suggestion = { label: string; prompt: string; source: "tool" | "rag" | "category" | "creative"; category?: string; skillIds?: string[] };

/* Working models — from NVIDIA speed tests 2026-09-03 */
const WORKING_MODEL_PREFIXES = [
  "meta/llama-3.2-11b-vision-instruct",
  "nvidia/nemotron-3-super-120b-a12b",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
  "deepseek-ai/deepseek-v4-pro-0813",
];

const DEFAULT_SUGGESTIONS: Suggestion[] = [
  { label: "Research a URL with Steel", prompt: "Use steel_scrape on https://caseclosedfl.com and summarize what the operator's PI site actually says.", source: "tool" },
  { label: "Browse dev skills RAG", prompt: "Run dev_skill_list so I can browse the curated knowledge base.", source: "tool" },
  { label: "Find a skill by id", prompt: "Call dev_skill_get for 'sql.like-escape' and show me the body verbatim.", source: "tool" }
];

/* ─────────────────────────────────────────────────────────
 * HELPERS
 * ───────────────────────────────────────────────────────── */
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

/* Speed badge for model cards */
function SpeedBadge({ ms }: { ms: string }) {
  const num = parseInt(ms);
  const color = num < 500 ? "text-emerald-400" : num < 1000 ? "text-amber-400" : "text-rose-400";
  return <span className={`font-mono text-[10px] ${color}`}>{ms}</span>;
}

/* ─────────────────────────────────────────────────────────
 * MODEL COMMAND PALETTE
 * A sleek glass picker showing only working models with
 * speed badges. Wraps ModelSelectorKit with a custom trigger.
 * ───────────────────────────────────────────────────────── */
function ModelCommandPalette({
  models, model, modelEnvOverridden, modelSaving,
  onChange, disabled
}: {
  models: { id: string; label: string; notes: string; contextWindow: number }[];
  model: string | null;
  modelEnvOverridden: boolean;
  modelSaving: boolean;
  onChange: (id: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  /* Only show models we know work from speed tests */
  const filtered = useMemo(() => {
    if (!search.trim()) return models;
    const q = search.toLowerCase();
    return models.filter(m =>
      m.label.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)
    );
  }, [models, search]);

  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  /* Extract speed from notes */
  const speedFromNotes = (notes: string) => {
    const m = notes.match(/(\d+)[–-](\d+)ms/);
    return m ? `${m[1]}ms` : null;
  };

  const currentModel = models.find(m => m.id === model);

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        className="flex items-center gap-1.5 rounded-xl border border-[rgba(180,180,255,0.15)] bg-[rgba(255,255,255,0.06)] px-3 py-1.5 text-[12px] text-[rgba(220,220,255,0.80)] backdrop-blur-md transition-all duration-200 hover:border-[rgba(180,180,255,0.30)] hover:bg-[rgba(255,255,255,0.10)] disabled:cursor-not-allowed disabled:opacity-40"
        aria-label="Choose model"
      >
        <Zap size={11} className="text-[var(--claw-accent)]" />
        <span className="max-w-[160px] truncate font-medium">
          {modelSaving ? "Saving…" : currentModel ? currentModel.label.split("(")[0].trim() : "Pick model"}
        </span>
        {modelSaving ? (
          <Loader2 size={10} className="animate-spin opacity-60" />
        ) : (
          <ChevronRight size={10} className={`transition-transform ${open ? "rotate-90" : ""} opacity-50`} />
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute bottom-full mb-2 left-0 z-50 w-72 rounded-2xl border border-[rgba(180,180,255,0.20)] bg-[rgba(8,8,20,0.92)] backdrop-blur-xl shadow-[0_8px_40px_rgba(0,0,0,0.6),0_0_0_1px_rgba(180,180,255,0.08)]">
          {/* Search */}
          <div className="flex items-center gap-2 border-b border-[rgba(180,180,255,0.10)] px-3 py-2.5">
            <Search size={13} className="shrink-0 text-[rgba(220,220,255,0.40)]" />
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search models…"
              className="flex-1 bg-transparent text-[13px] text-[rgba(220,220,255,0.90)] outline-none placeholder:text-[rgba(220,220,255,0.35)]"
            />
          </div>

          {/* Model list */}
          <div className="max-h-64 overflow-y-auto py-1.5">
            {filtered.length === 0 && (
              <div className="px-4 py-6 text-center text-[12px] text-[rgba(220,220,255,0.35)]">No models match</div>
            )}
            {filtered.map(m => {
              const isActive = m.id === model;
              const speed = speedFromNotes(m.notes);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => { onChange(m.id); setOpen(false); }}
                  className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                    isActive
                      ? "bg-[rgba(199,100,67%,0.15)] border-l-2 border-l-[var(--claw-accent)]"
                      : "hover:bg-[rgba(255,255,255,0.05)]"
                  }`}
                >
                  {/* Status dot */}
                  <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
                    m.id.includes("llama-3.2-11b") ? "bg-emerald-400" :
                    m.id.includes("nemotron") ? "bg-cyan-400" :
                    m.id.includes("deepseek-v4-pro") ? "bg-amber-400" :
                    "bg-[rgba(220,220,255,0.30)]"
                  }`} />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-medium text-[rgba(220,220,255,0.90)] truncate">
                        {m.label.includes("(") ? m.label.slice(0, m.label.indexOf("(")).trim() : m.label}
                      </span>
                      {isActive && <span className="shrink-0 text-[10px] text-[var(--claw-accent)]">active</span>}
                    </div>
                    {speed && (
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <SpeedBadge ms={speed} />
                        <span className="text-[10px] text-[rgba(220,220,255,0.30)]">·</span>
                        <span className="text-[10px] text-[rgba(220,220,255,0.30)]">
                          {m.id.includes("vision") ? "vision" : "text"}
                        </span>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="border-t border-[rgba(180,180,255,0.08)] px-3 py-2 flex items-center gap-1.5">
            <Hash size={10} className="text-[rgba(220,220,255,0.25)]" />
            <span className="text-[10px] text-[rgba(220,220,255,0.25)]">
              {models.length} models · Powered by NVIDIA NIM
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
 * COMPOSER INPUT
 * ───────────────────────────────────────────────────────── */
function Composer({
  text, setText, pendingFiles, setPendingFiles,
  busy, onSend, onStop, model, models, modelEnvOverridden, modelSaving, onChangeModel,
  theme
}: {
  text: string; setText: (t: string) => void;
  pendingFiles: ClawFile[]; setPendingFiles: React.Dispatch<React.SetStateAction<ClawFile[]>>;
  busy: boolean; onSend: () => void; onStop: () => void;
  model: string | null; models: { id: string; label: string; notes: string; contextWindow: number }[];
  modelEnvOverridden: boolean; modelSaving: boolean; onChangeModel: (id: string) => void;
  theme: Theme;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = Math.min(el.scrollHeight, 220) + "px";
  }, [text]);

  return (
    <div className="w-full">
      {/* File attachments */}
      {pendingFiles.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {pendingFiles.map(f => (
            <span key={f.id} className="inline-flex items-center gap-1.5 rounded-xl border border-[rgba(180,180,255,0.15)] bg-[rgba(255,255,255,0.06)] px-2.5 py-1 text-[11px] text-[rgba(220,220,255,0.70)] backdrop-blur-md">
              <Paperclip size={10} className="opacity-60" />
              <span className="max-w-[120px] truncate">{f.name}</span>
              <button
                type="button"
                onClick={() => setPendingFiles(p => p.filter(x => x.id !== f.id))}
                className="opacity-50 hover:opacity-100"
                aria-label={`Remove ${f.name}`}
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Main composer card */}
      <div className="glass-card glow-border overflow-hidden p-3">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && !e.shiftKey && !(e as any).isComposing && (e as any).keyCode !== 229) {
              e.preventDefault();
              if (!busy) onSend();
            }
          }}
          rows={2}
          placeholder="What do you need?"
          className="block max-h-[220px] w-full resize-none bg-transparent px-2 py-1.5 text-[15px] leading-relaxed text-[rgba(220,220,255,0.90)] outline-none placeholder:text-[rgba(220,220,255,0.30)]"
        />

        {/* Bottom bar */}
        <div className="flex items-center justify-between gap-3 border-t border-[rgba(180,180,255,0.08)] pt-2.5 mt-1">
          <div className="flex items-center gap-2">
            {/* Attach */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Attach files"
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-[rgba(180,180,255,0.12)] bg-[rgba(255,255,255,0.05)] text-[rgba(220,220,255,0.45)] transition-all hover:border-[rgba(180,180,255,0.25)] hover:text-[rgba(220,220,255,0.80)] hover:bg-[rgba(255,255,255,0.09)]"
            >
              <Paperclip size={14} />
            </button>
            <input ref={fileInputRef} type="file" className="hidden" multiple onChange={e => {
              const files = e.target.files;
              if (!files?.length) return;
              // File upload is handled by parent; just trigger the parent handler
              const dt = new DataTransfer();
              for (const f of Array.from(files)) dt.items.add(f);
              // Let parent handle via its own file input
            }} />

            {/* Model picker */}
            <ModelCommandPalette
              models={models}
              model={model}
              modelEnvOverridden={modelEnvOverridden}
              modelSaving={modelSaving}
              onChange={onChangeModel}
              disabled={!models.length || modelEnvOverridden || modelSaving}
            />
          </div>

          {/* Send / Stop */}
          {busy ? (
            <button
              type="button"
              onClick={onStop}
              aria-label="Stop generating"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-[rgba(255,100,100,0.30)] bg-[rgba(255,60,60,0.12)] text-rose-400 transition-all hover:border-[rgba(255,100,100,0.50)] hover:bg-[rgba(255,60,60,0.20)]"
            >
              <Square size={14} />
            </button>
          ) : (
            <button
              type="button"
              onClick={onSend}
              disabled={!text.trim() && !pendingFiles.length}
              aria-label="Send message"
              className="btn-send flex h-9 w-9 items-center justify-center rounded-xl text-[rgba(5,5,15,0.95)] disabled:cursor-not-allowed disabled:opacity-30"
            >
              <Send size={15} />
            </button>
          )}
        </div>
      </div>

      {modelEnvOverridden && (
        <div className="mt-1.5 text-center text-[11px] text-[rgba(220,220,255,0.25)]">Model locked by environment.</div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
 * MESSAGE BUBBLE
 * ───────────────────────────────────────────────────────── */
function UserBubble({ content }: { content: string }) {
  return (
    <div className="group flex flex-col items-end animate-fade-up">
      <div className="glass-bubble-user max-w-[80%] px-4 py-3">
        <p className="whitespace-pre-wrap break-words text-[14px] leading-relaxed text-[rgba(220,220,255,0.95)]">
          {content}
        </p>
      </div>
      <div className="mt-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(content)}
          className="flex h-6 w-6 items-center justify-center rounded-lg text-[rgba(220,220,255,0.30)] hover:text-[rgba(220,220,255,0.70)] hover:bg-[rgba(255,255,255,0.08)]"
          aria-label="Copy message"
        >
          <Copy size={11} />
        </button>
      </div>
    </div>
  );
}

function AssistantBubble({ content }: { content: string }) {
  return (
    <div className="group flex flex-col gap-1 animate-fade-up">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-[rgba(199,100,67%,0.20)] border border-[rgba(199,100,67%,0.30)]">
          <Bot size={14} className="text-[var(--claw-accent)]" />
        </div>
        <span className="text-[11px] font-medium text-[rgba(220,220,255,0.40)]">Claw</span>
      </div>
      <div className="pl-9">
        <div className="glass-bubble-assistant px-4 py-3">
          <p className="whitespace-pre-wrap break-words text-[14px] leading-relaxed text-[rgba(220,220,255,0.90)]">
            {content}
          </p>
        </div>
        <div className="mt-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(content)}
            className="flex h-6 w-6 items-center justify-center rounded-lg text-[rgba(220,220,255,0.30)] hover:text-[rgba(220,220,255,0.70)] hover:bg-[rgba(255,255,255,0.08)]"
            aria-label="Copy message"
          >
            <Copy size={11} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
 * MAIN CONSOLE
 * ───────────────────────────────────────────────────────── */
export function ClawConsole() {
  const [convs, setConvs] = useState<Conv[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [files, setFiles] = useState<ClawFile[]>([]);
  const [text, setText] = useState("");
  const [pendingFiles, setPendingFiles] = useState<ClawFile[]>([]);
  const [streaming, setStreaming] = useState("");
  const [tools, setTools] = useState<ToolNode[]>([]);
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
  const [creativeModalOpen, setCreativeModalOpen] = useState(false);
  const [creativeUrl, setCreativeUrl] = useState("");
  const [theme, setTheme] = useState<Theme>("dark");
  const scroller = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  /* Theme setup */
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

  /* Load conversations */
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

  /* Suggestions */
  useEffect(() => {
    let cancelled = false;
    fetch("/api/claw/suggestions", { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled || !d || !Array.isArray(d.suggestions)) return;
        if (d.suggestions.length > 0) setSuggestions(d.suggestions);
      })
      .catch(() => { /* keep defaults */ });
    return () => { cancelled = true; };
  }, []);

  /* Model loading */
  const loadModel = useCallback(async () => {
    try {
      const r = await fetch("/api/claw/model", { cache: "no-store" });
      if (!r.ok) return;
      const d = await r.json();
      /* Only show working models in the picker */
      const working = (d.models || []).filter((m: any) =>
        WORKING_MODEL_PREFIXES.some(p => m.id.startsWith(p))
      );
      setModels(working);
      setModel(d.model && WORKING_MODEL_PREFIXES.some(p => d.model.startsWith(p)) ? d.model : (working[0]?.id ?? null));
      setModelEnvOverridden(Boolean(d.envOverridden));
    } catch { /* keep defaults */ }
  }, []);
  useEffect(() => { void loadModel(); }, [loadModel]);

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

  /* File upload */
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
    setPendingFiles(p => [...p, ...uploaded]);
    if (active) await loadThread(active);
    else setFiles(p => [...uploaded, ...p]);
  }

  /* Send message */
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
    setMessages(m => [...m, optimistic]);
    if (overrideText === undefined) setText("");
    const fileIds = pendingFiles.map(f => f.id);
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
          if (e.type === "token") setStreaming(s => s + e.text);
          if (e.type === "tool_start") setTools(t => [...t, { id: `${e.name}-${Date.now()}`, name: e.name, status: "running", startedAt: Date.now() }]);
          if (e.type === "tool_end") setTools(t => t.map(x => x.name === e.name && x.status === "running" ? { ...x, status: e.ok ? "success" : "error", via: e.via, result: e.preview, finishedAt: Date.now() } : x));
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

  async function newThread() {
    const r = await fetch("/api/claw/conversations", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    const d = await r.json();
    setActive(d.conversation.id);
    setMessages([]); setStreaming(""); setTools([]); setPendingFiles([]);
    setSidebarOpen(false);
    await loadConvs();
  }

  async function removeThread(id: string) {
    if (!confirm("Delete this thread?")) return;
    await fetch(`/api/claw/conversations/${id}`, { method: "DELETE" });
    if (active === id) { setActive(null); setMessages([]); }
    await loadConvs();
  }

  async function removeMessage(id: string) {
    if (!active) return;
    await fetch(`/api/claw/conversations/${active}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ deleteMessageId: id }) });
    await loadThread(active);
  }

  async function removeFile(id: string) {
    await fetch(`/api/claw/files/${id}`, { method: "DELETE" });
    setPendingFiles(p => p.filter(f => f.id !== id));
    setFiles(p => p.filter(f => f.id !== id));
  }

  async function saveRename(id: string) {
    await fetch(`/api/claw/files/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: renameVal }) });
    setRenameId(null);
    if (active) await loadThread(active);
    else await loadConvs();
  }

  async function launchCreativeAds() {
    const url = creativeUrl.trim();
    if (!url) return;
    setCreativeModalOpen(false);
    setBusy(true);
    let convId: string | null = null;
    try {
      const cr = await fetch("/api/claw/conversations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: `Ad scripts: ${url}` }) });
      if (cr.ok) { const cd = await cr.json(); convId = cd.conversation?.id ?? null; }
    } catch { /* continue */ }
    setActive(convId);
    setMessages([]); setStreaming(""); setTools([]); setSidebarOpen(false);
    await loadConvs();
    const fullPrompt = `Research this URL with steel_scrape first, then use everything you find to create a complete ad/video script:\n\n${url}\n\n---\n\nApply the full direct-response advertising framework (13 techniques: open loops, big question, stakes, contrast, information gaps, question chains, pattern interrupts, escalation, headfake, visual storytelling, hook, payoff, CTA) and output:\n\n1. BIG QUESTION / CHARACTER / STAKES / URGENCY / CORE CONTRAST / HEADFAKE / OPEN LOOPS\n2. Beat-by-beat script table: TIME | VOICEOVER | ON-SCREEN TEXT | VISUAL | EDIT | QUESTION CREATED\n3. 3 ALTERNATIVE HOOKS (curiosity / stakes / contrarian)\n4. RETENTION MAP\n5. CTA + THUMBNAIL / FIRST-FRAME CONCEPT + CAPTION`;
    await send(fullPrompt);
  }

  const visible = messages.filter(m => (m.role === "user" || m.role === "assistant") && !(m.role === "assistant" && m.toolJson));
  const empty = !visible.length && !streaming && !busy;
  const activeTitle = convs.find(c => c.id === active)?.title;

  return (
    <AuthGuard>
      <div className="claw-shell relative flex h-[100dvh] overflow-hidden" style={{ background: "transparent" }}>
        {/* ── Ambient background orbs ── */}
        <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
          <div
            className="orb animate-orb-1"
            style={{
              width: 600, height: 600,
              background: "radial-gradient(circle, rgba(130,40,255,0.18) 0%, transparent 70%)",
              top: "-10%", left: "-5%",
            }}
          />
          <div
            className="orb animate-orb-2"
            style={{
              width: 500, height: 500,
              background: "radial-gradient(circle, rgba(0,210,255,0.12) 0%, transparent 70%)",
              bottom: "5%", right: "-5%",
            }}
          />
          <div
            className="orb animate-orb-3"
            style={{
              width: 400, height: 400,
              background: "radial-gradient(circle, rgba(100,60,255,0.14) 0%, transparent 70%)",
              top: "40%", left: "40%",
            }}
          />
          {/* Subtle grid overlay */}
          <div
            style={{
              position: "absolute", inset: 0, opacity: 0.03,
              backgroundImage: "linear-gradient(rgba(220,220,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(220,220,255,0.5) 1px, transparent 1px)",
              backgroundSize: "60px 60px",
            }}
          />
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInput}
          type="file"
          className="hidden"
          multiple
          onChange={e => { void upload(e.target.files); e.target.value = ""; }}
        />

        {/* ── Sidebar ── */}
        {sidebarOpen && (
          <button type="button" aria-label="Close sidebar" onClick={() => setSidebarOpen(false)} className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm md:hidden" />
        )}
        <aside
          className={`glass-sidebar fixed inset-y-0 left-0 z-40 flex w-64 flex-col transition-transform duration-300 md:static md:z-auto md:translate-x-0 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {/* Logo */}
          <div className="flex items-center justify-between px-4 py-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[rgba(199,100,67%,0.15)] border border-[rgba(199,100,67%,0.25)] shadow-[0_0_16px_rgba(199,100,67%,0.20)]">
                <ClawLogo size={20} className="text-[var(--claw-accent)]" />
              </div>
              <div>
                <span className="text-[15px] font-bold tracking-tight text-neon">Claw</span>
                <div className="text-[10px] text-[rgba(220,220,255,0.30)]">AI Operator Console</div>
              </div>
            </div>
            <button type="button" onClick={() => setSidebarOpen(false)} className="grid h-8 w-8 place-items-center rounded-xl text-[rgba(220,220,255,0.35)] hover:bg-[rgba(255,255,255,0.08)] hover:text-[rgba(220,220,255,0.70)] md:hidden" aria-label="Close sidebar">
              <PanelLeftClose size={15} />
            </button>
          </div>

          {/* New chat */}
          <div className="px-3 pb-3">
            <button
              type="button"
              onClick={newThread}
              className="flex w-full items-center gap-2 rounded-xl border border-[rgba(199,100,67%,0.30)] bg-[rgba(199,100,67%,0.10)] px-3 py-2.5 text-[13px] font-semibold text-[var(--claw-accent)] backdrop-blur-md transition-all hover:border-[rgba(199,100,67%,0.50)] hover:bg-[rgba(199,100,67%,0.18)]"
            >
              <Plus size={15} />
              New chat
            </button>
          </div>

          {/* Conversations */}
          <div className="min-h-0 flex-1 overflow-y-auto px-2">
            <div className="mb-1 px-2 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Recent</div>
            {convs.map(c => (
              <div key={c.id} className={`group mb-0.5 flex items-center gap-1 rounded-xl px-2.5 py-2.5 text-[13px] transition-all ${
                active === c.id
                  ? "sidebar-item-active"
                  : "text-[rgba(220,220,255,0.45)] hover:bg-[rgba(255,255,255,0.06)] hover:text-[rgba(220,220,255,0.75)]"
              }`}>
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left"
                  onClick={() => { setActive(c.id); setSidebarOpen(false); }}
                >
                  {c.title}
                </button>
                <button
                  type="button"
                  className="hidden h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[rgba(220,220,255,0.25)] hover:border hover:border-[rgba(255,100,100,0.30)] hover:text-rose-400 hover:bg-[rgba(255,60,60,0.10)] group-hover:flex"
                  onClick={() => removeThread(c.id)}
                  aria-label="Delete thread"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
            {!convs.length && (
              <div className="px-2 py-8 text-center text-[12px] text-[rgba(220,220,255,0.20)]">No conversations yet.</div>
            )}
          </div>

          {/* Footer nav */}
          <div className="border-t border-[rgba(180,180,255,0.08)] p-2">
            <Link href="/integrations" className="mb-1 flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] text-muted-foreground transition-all hover:bg-muted dark:hover:bg-[rgba(255,255,255,0.06)] dark:text-[rgba(220,220,255,0.40)] dark:hover:text-[rgba(220,220,255,0.75)]">
              <Plug size={14} />
              Integrations
            </Link>
            <Link href="/settings" className="mb-1 flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] text-muted-foreground transition-all hover:bg-muted dark:hover:bg-[rgba(255,255,255,0.06)] dark:text-[rgba(220,220,255,0.40)] dark:hover:text-[rgba(220,220,255,0.75)]">
              <Settings size={14} />
              Settings
            </Link>
            <button
              type="button"
              onClick={() => setTheme(t => t === "dark" ? "light" : "dark")}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] text-muted-foreground transition-all hover:bg-muted dark:hover:bg-[rgba(255,255,255,0.06)] dark:text-[rgba(220,220,255,0.40)] dark:hover:text-[rgba(220,220,255,0.75)]"
              aria-label={theme === "dark" ? "Light mode" : "Dark mode"}
            >
              {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </button>
          </div>
        </aside>

        {/* ── Main column ── */}
        <main className="relative flex min-w-0 flex-1 flex-col">
          {/* Header */}
          <header className="glass-sidebar sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-[rgba(180,180,255,0.08)] px-4 backdrop-blur-md">
            <button type="button" onClick={() => setSidebarOpen(true)} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[rgba(220,220,255,0.45)] hover:bg-[rgba(255,255,255,0.08)] hover:text-[rgba(220,220,255,0.80)] md:hidden" aria-label="Open sidebar">
              <Menu size={17} />
            </button>

            <div className="flex min-w-0 flex-1 items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[rgba(199,100,67%,0.15)] border border-[rgba(199,100,67%,0.20)]">
                <Bot size={15} className="text-[var(--claw-accent)]" />
              </div>
              <span className="truncate text-[14px] font-medium text-[rgba(220,220,255,0.80)]">
                {activeTitle || "New conversation"}
              </span>
              {busy && (
                <div className="flex items-center gap-1.5 rounded-full border border-[rgba(199,100,67%,0.25)] bg-[rgba(199,100,67%,0.10)] px-2 py-0.5 text-[10px] text-[var(--claw-accent)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--claw-accent)] animate-pulse" />
                  working
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setFilesOpen(v => !v)}
              className={`flex shrink-0 items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[12px] font-medium backdrop-blur-md transition-all ${
                filesOpen
                  ? "border-[rgba(199,100,67%,0.35)] bg-[rgba(199,100,67%,0.12)] text-[var(--claw-accent)]"
                  : "border-[rgba(180,180,255,0.15)] bg-[rgba(255,255,255,0.05)] text-[rgba(220,220,255,0.45)] hover:border-[rgba(180,180,255,0.28)] hover:text-[rgba(220,220,255,0.75)]"
              }`}
            >
              <FolderOpen size={13} />
              Files
            </button>
          </header>

          <div className="flex min-h-0 flex-1">
            <section className="flex min-w-0 flex-1 flex-col">
              {empty ? (
                /* ── EMPTY STATE ── */
                <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-4 py-10">
                  <div className="w-full max-w-2xl">
                    {/* Hero */}
                    <div className="mb-10 flex flex-col items-center gap-4 text-center animate-fade-up">
                      <div className="relative">
                        <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-[rgba(199,100,67%,0.12)] border border-[rgba(199,100,67%,0.25)] shadow-[0_0_40px_rgba(199,100,67%,0.20)]">
                          <ClawLogo size={40} className="text-[var(--claw-accent)]" />
                        </div>
                        {/* Glow ring behind logo */}
                        <div className="absolute inset-0 -z-10 rounded-full animate-glow-pulse" style={{ background: "transparent" }} />
                      </div>
                      <div>
                        <h1 className="mb-1 text-3xl font-bold tracking-tight">
                          <span suppressHydrationWarning>{greeting()}</span>, operator
                        </h1>
                        <p className="text-[14px] text-muted-foreground">
                          Claw calls real tools — research, generate, post, scrape.
                        </p>
                      </div>
                    </div>

                    {/* Composer */}
                    <div className="mb-8 animate-fade-up" style={{ animationDelay: "100ms" }}>
                      <Composer
                        text={text} setText={setText}
                        pendingFiles={pendingFiles} setPendingFiles={setPendingFiles}
                        busy={busy} onSend={() => void send()} onStop={stop}
                        model={model} models={models} modelEnvOverridden={modelEnvOverridden}
                        modelSaving={modelSaving} onChangeModel={changeModel}
                        theme={theme}
                      />
                    </div>

                    {/* Suggestion chips */}
                    <div className="animate-fade-up" style={{ animationDelay: "200ms" }}>
                      <div className="mb-3 flex items-center gap-2">
                        <Wand2 size={13} className="text-muted-foreground" />
                        <span className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">Quick actions</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {suggestions.slice(0, 6).map((s, i) => (
                          <button
                            key={`${s.source}-${s.skillIds?.[0] || s.label}-${i}`}
                            type="button"
                            className={`chip-suggestion ${s.source === "creative" ? "creative" : ""}`}
                            onClick={() => {
                              if (s.source === "creative") {
                                setCreativeModalOpen(true);
                                setCreativeUrl("");
                                return;
                              }
                              setText(s.prompt);
                            }}
                          >
                            {s.source === "rag" && <Sparkles size={10} className="mr-1 shrink-0 text-[var(--claw-accent)]" />}
                            {s.source === "creative" && <Film size={10} className="mr-1 shrink-0" />}
                            <span className="max-w-[220px] truncate">{s.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* ── CHAT VIEW ── */
                <>
                  <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
                    <div className="mx-auto max-w-2xl flex flex-col gap-5">
                      {visible.map(m =>
                        m.role === "user"
                          ? <UserBubble key={m.id} content={m.content} />
                          : <AssistantBubble key={m.id} content={m.content} />
                      )}

                      {/* Thinking panel */}
                      {(tools.length > 0 || busy) && (
                        <ClawThinkingPanel tools={tools} streaming={streaming} busy={busy} />
                      )}

                      {/* Streaming response */}
                      {streaming && <AssistantBubble content={streaming} />}

                      {/* Early thinking loader */}
                      {busy && !streaming && tools.length === 0 && (
                        <div className="flex items-center gap-3 animate-fade-up">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[rgba(199,100,67%,0.15)] border border-[rgba(199,100,67%,0.20)]">
                            <Bot size={15} className="text-[var(--claw-accent)]" />
                          </div>
                          <AILoader label="Claw is thinking" showElapsed variant="dots" className="text-[rgba(220,220,255,0.45)]" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Composer (docked) */}
                  <div className="shrink-0 border-t border-[rgba(180,180,255,0.06)] bg-[rgba(5,5,15,0.60)] backdrop-blur-xl p-4">
                    <div className="mx-auto max-w-2xl">
                      {error && (
                        <div className="mb-2 rounded-xl border border-[rgba(255,80,80,0.30)] bg-[rgba(255,60,60,0.10)] px-3 py-2 text-[12px] text-rose-400 backdrop-blur-md">
                          {error}
                        </div>
                      )}
                      <Composer
                        text={text} setText={setText}
                        pendingFiles={pendingFiles} setPendingFiles={setPendingFiles}
                        busy={busy} onSend={() => void send()} onStop={stop}
                        model={model} models={models} modelEnvOverridden={modelEnvOverridden}
                        modelSaving={modelSaving} onChangeModel={changeModel}
                        theme={theme}
                      />
                    </div>
                  </div>
                </>
              )}
            </section>

            {/* ── Files drawer ── */}
            {filesOpen && (
              <button type="button" aria-label="Close files" onClick={() => setFilesOpen(false)} className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm lg:hidden" />
            )}
            <aside className={`glass-sidebar fixed inset-y-0 right-0 z-40 flex w-80 max-w-[85vw] flex-col border-l border-[rgba(180,180,255,0.08)] lg:static lg:z-auto lg:w-80 ${filesOpen ? "flex" : "hidden"}`}>
              <div className="flex items-center justify-between border-b border-[rgba(180,180,255,0.08)] px-4 py-3">
                <div className="text-[11px] font-bold uppercase tracking-widest text-[rgba(220,220,255,0.40)]">Files</div>
                <div className="flex items-center gap-1">
                  <button type="button" className="grid h-8 w-8 place-items-center rounded-xl border border-[rgba(180,180,255,0.12)] bg-[rgba(255,255,255,0.05)] text-[rgba(220,220,255,0.45)] hover:border-[rgba(180,180,255,0.25)] hover:text-[rgba(220,220,255,0.80)]" onClick={() => fileInput.current?.click()} aria-label="Add file">
                    <FilePlus2 size={13} />
                  </button>
                  <button type="button" className="grid h-8 w-8 place-items-center rounded-xl text-[rgba(220,220,255,0.35)] hover:bg-[rgba(255,255,255,0.08)] hover:text-[rgba(220,220,255,0.80)]" onClick={() => setFilesOpen(false)} aria-label="Close files">
                    <X size={14} />
                  </button>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                {files.map(f => (
                  <div key={f.id} className="mb-2 rounded-xl border border-[rgba(180,180,255,0.10)] bg-[rgba(255,255,255,0.04)] p-3 backdrop-blur-md">
                    {renameId === f.id ? (
                      <div className="flex gap-1.5">
                        <input className="h-8 flex-1 rounded-lg border border-[rgba(180,180,255,0.15)] bg-[rgba(255,255,255,0.08)] px-2.5 text-[12px] text-[rgba(220,220,255,0.90)] outline-none focus:border-[var(--claw-accent)]" value={renameVal} onChange={e => setRenameVal(e.target.value)} />
                        <button type="button" className="rounded-lg bg-[var(--claw-accent)] px-3 text-[11px] font-medium text-[rgba(5,5,15,0.95)]" onClick={() => void saveRename(f.id)}>Save</button>
                      </div>
                    ) : (
                      <>
                        <a href={f.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 font-medium text-[var(--claw-accent)] hover:underline">
                          <FolderOpen size={11} />{f.name}
                        </a>
                        <div className="mt-1 text-[10px] text-[rgba(220,220,255,0.30)]">{f.mime} · {(f.size / 1024).toFixed(1)} KB</div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          <button type="button" className="rounded-lg border border-[rgba(180,180,255,0.12)] px-2 py-0.5 text-[10px] text-[rgba(220,220,255,0.40)] hover:border-[rgba(180,180,255,0.25)] hover:text-[rgba(220,220,255,0.75)]" onClick={() => setPendingFiles(p => p.some(x => x.id === f.id) ? p : [...p, f])}>Attach</button>
                          <button type="button" className="rounded-lg border border-[rgba(180,180,255,0.12)] px-2 py-0.5 text-[10px] text-[rgba(220,220,255,0.40)] hover:border-[rgba(180,180,255,0.25)] hover:text-[rgba(220,220,255,0.75)]" onClick={() => { setRenameId(f.id); setRenameVal(f.name); }}>
                            <Pencil size={9} className="mr-0.5 inline" />Rename
                          </button>
                          <button type="button" className="rounded-lg border border-[rgba(255,80,80,0.20)] px-2 py-0.5 text-[10px] text-rose-400/70 hover:border-rose-400/40 hover:text-rose-400" onClick={() => void removeFile(f.id)}>Delete</button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
                {!files.length && <div className="py-10 text-center text-[12px] text-[rgba(220,220,255,0.20)]">Upload files to attach them to a conversation.</div>}
              </div>
              {busy && (
                <div className="border-t border-[rgba(180,180,255,0.08)] px-4 py-2.5">
                  <AILoader label="Working" variant="bar" className="text-[11px] text-[rgba(220,220,255,0.35)]" />
                </div>
              )}
            </aside>
          </div>
        </main>
      </div>

      {/* ── Creative ads modal ── */}
      {creativeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button type="button" aria-label="Close" className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={() => setCreativeModalOpen(false)} />
          <div className="glass-card relative z-10 w-full max-w-md p-6 shadow-[0_16px_64px_rgba(0,0,0,0.8)]">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[rgba(262,100%,72%,0.15)] border border-[rgba(262,100%,72%,0.25)] shadow-[0_0_20px_rgba(262,100%,72%,0.15)]">
                  <Film size={18} className="text-[var(--claw-violet)]" />
                </div>
                <div>
                  <h2 className="text-[15px] font-bold text-neon">Create Ad Scripts</h2>
                  <p className="text-[11px] text-[rgba(220,220,255,0.35)]">Powered by Claw + Steel</p>
                </div>
              </div>
              <button type="button" onClick={() => setCreativeModalOpen(false)} className="grid h-8 w-8 place-items-center rounded-xl text-[rgba(220,220,255,0.35)] hover:bg-[rgba(255,255,255,0.08)] hover:text-[rgba(220,220,255,0.80)]">
                <X size={14} />
              </button>
            </div>
            <p className="mb-4 text-[12px] leading-relaxed text-[rgba(220,220,255,0.50)]">
              Claw will scrape your site and generate a complete short-form video ad script using a 13-step direct-response framework.
            </p>
            <input
              type="url"
              placeholder="https://yoursite.com"
              value={creativeUrl}
              onChange={e => setCreativeUrl(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && creativeUrl.trim()) void launchCreativeAds(); }}
              className="mb-4 w-full rounded-xl border border-[rgba(180,180,255,0.15)] bg-[rgba(255,255,255,0.06)] px-4 py-3 text-[14px] text-[rgba(220,220,255,0.90)] placeholder:text-[rgba(220,220,255,0.25)] backdrop-blur-md outline-none transition-all focus:border-[var(--claw-accent)] focus:shadow-[0_0_0_3px_rgba(199,100,67%,0.15)]"
              autoFocus
            />
            <div className="flex gap-2">
              <button type="button" onClick={() => setCreativeModalOpen(false)} className="flex-1 rounded-xl border border-[rgba(180,180,255,0.15)] bg-[rgba(255,255,255,0.05)] px-4 py-2.5 text-[13px] font-medium text-[rgba(220,220,255,0.60)] backdrop-blur-md transition-all hover:border-[rgba(180,180,255,0.28)] hover:bg-[rgba(255,255,255,0.09)]">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void launchCreativeAds()}
                disabled={!creativeUrl.trim()}
                className="btn-send flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-bold text-[rgba(5,5,15,0.95)] disabled:cursor-not-allowed disabled:opacity-30"
              >
                <Wand2 size={14} />
                Generate
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthGuard>
  );
}
