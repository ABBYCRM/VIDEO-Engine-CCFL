"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import Link from "next/link";
import {
  ChevronRight, FilePlus2, Film, FolderOpen,
  Hash, Loader2, Menu, Monitor, Moon, PanelLeftClose,
  Pencil, Plug, Plus, Search, Settings, Sparkles,
  Sun, Trash2, Wand2, X, Zap
} from "lucide-react";
import { ClawLogo } from "@/components/claw-logo";
import { ComputerDock } from "@/components/computer-dock";
import { ForgeConsole } from "@/components/forge-console";
import { SwarmConsole } from "@/components/swarm-console";
import AILoader from "@/components/ui/ai-loader";
import { ClawThinkingPanel, type ToolNode, type SelfStateView } from "@/components/ui/claw-thinking-panel";
import { InputBar } from "@/components/ui/input-bar";
import { AiMessageBubble } from "@/components/ui/message-bubble";
import { Suggestions } from "@/components/ui/suggestions";
import { MessageList, type AgentMessage } from "@/components/ui/agent-chat";
import { humanToolProgress, isTranscriptAssistantContent, looksLikeInternalState, sanitizeUserVisibleMessage } from "@/lib/claw/user-visible";

/* ─────────────────────────────────────────────────────────
 * TYPES
 * ───────────────────────────────────────────────────────── */
type Conv = { id: string; title: string; createdAt: string; updatedAt: string };
type Msg = { id: string; role: "user" | "assistant" | "tool" | "system"; content: string; toolJson?: any; createdAt: string };
type ClawFile = { id: string; name: string; mime: string; size: number; url: string };
type Theme = "light" | "dark";
type Suggestion = { label: string; prompt: string; source: "tool" | "rag" | "category" | "creative"; category?: string; skillIds?: string[] };

/* Agentic / tool-calling Bitdeer models */
const WORKING_MODEL_PREFIXES = [
  "mistralai/Mistral-Large-3-675B-Instruct-2512",
  "zai-org/GLM-5",
];

const DEFAULT_SUGGESTIONS: Suggestion[] = [
  { label: "Drive Chrome", prompt: "Open https://example.com, look at the screen, and tell me the exact title and first visible heading.", source: "tool" },
  { label: "Fingerprint check", prompt: "Build a Forge session and probe the fingerprint lab. Report webdriver, HeadlessChrome, and the anomaly score.", source: "tool" },
  { label: "Research it", prompt: "Compare SQLite vs managed Postgres for a single-node DigitalOcean agent orchestrator that already runs Chromium. Recommend one for MVP.", source: "tool" },
  { label: "Read a URL", prompt: "Use steel_scrape on https://caseclosedfl.com and summarize what the site actually says.", source: "tool" },
  { label: "Browse skills", prompt: "Run dev_skill_list so I can browse the curated knowledge base.", source: "tool" },
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

function SpeedBadge({ ms }: { ms: string }) {
  const num = parseInt(ms);
  const color = num < 500 ? "text-emerald-500" : num < 1000 ? "text-amber-500" : "text-rose-500";
  return <span className={`font-mono text-[10px] ${color}`}>{ms}</span>;
}

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

  const speedFromNotes = (notes: string) => {
    const m = notes.match(/(\d+)[–-](\d+)ms/);
    return m ? `${m[1]}ms` : null;
  };

  const currentModel = models.find(m => m.id === model);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-neutral-300 dark:hover:bg-neutral-800"
        aria-label="Choose model"
      >
        <Zap size={11} className="text-neutral-400" />
        <span className="max-w-[140px] truncate">
          {modelSaving ? "Saving…" : currentModel ? currentModel.label.split("(")[0].trim() : "Pick model"}
        </span>
        {modelSaving ? (
          <Loader2 size={10} className="animate-spin opacity-60" />
        ) : (
          <ChevronRight size={10} className={`opacity-50 transition-transform ${open ? "rotate-90" : ""}`} />
        )}
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-50 mb-2 w-72 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center gap-2 border-b border-neutral-200 px-3 py-2.5 dark:border-neutral-800">
            <Search size={13} className="shrink-0 text-neutral-400" />
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search models…"
              className="flex-1 bg-transparent text-[13px] text-neutral-900 outline-none placeholder:text-neutral-400 dark:text-neutral-100"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1.5">
            {filtered.length === 0 && (
              <div className="px-4 py-6 text-center text-[12px] text-neutral-400">No models match</div>
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
                      ? "bg-neutral-100 dark:bg-neutral-800"
                      : "hover:bg-neutral-50 dark:hover:bg-neutral-800/70"
                  }`}
                >
                  <span className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${isActive ? "bg-neutral-900 dark:bg-white" : "bg-neutral-300 dark:bg-neutral-600"}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[12px] font-medium text-neutral-900 dark:text-neutral-100">
                        {m.label.includes("(") ? m.label.slice(0, m.label.indexOf("(")).trim() : m.label}
                      </span>
                      {isActive && <span className="shrink-0 text-[10px] text-neutral-400">active</span>}
                    </div>
                    {speed && (
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <SpeedBadge ms={speed} />
                        <span className="text-[10px] text-neutral-400">
                          {m.id.includes("vision") ? "vision" : "text"}
                        </span>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-1.5 border-t border-neutral-200 px-3 py-2 dark:border-neutral-800">
            <Hash size={10} className="text-neutral-400" />
            <span className="text-[10px] text-neutral-400">
              {models.length} models · Powered by NVIDIA NIM
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function Composer({
  text, setText, pendingFiles, setPendingFiles,
  busy, onSend, onStop, model, models, modelEnvOverridden, modelSaving, onChangeModel,
  onAttach,
}: {
  text: string; setText: (t: string) => void;
  pendingFiles: ClawFile[]; setPendingFiles: Dispatch<SetStateAction<ClawFile[]>>;
  busy: boolean; onSend: (content?: string) => void; onStop: () => void;
  model: string | null; models: { id: string; label: string; notes: string; contextWindow: number }[];
  modelEnvOverridden: boolean; modelSaving: boolean; onChangeModel: (id: string) => void;
  onAttach: () => void;
}) {
  return (
    <div className="w-full">
      <InputBar
        value={text}
        onChange={setText}
        status={busy ? "streaming" : "ready"}
        placeholder="What do you need?"
        onSend={({ content }) => onSend(content)}
        onStop={onStop}
        onAttach={onAttach}
        attachedFiles={pendingFiles.map(f => ({ id: f.id, filename: f.name, size: f.size }))}
        onRemoveFile={(id) => setPendingFiles(p => p.filter(x => x.id !== id))}
        leftActions={
          <ModelCommandPalette
            models={models}
            model={model}
            modelEnvOverridden={modelEnvOverridden}
            modelSaving={modelSaving}
            onChange={onChangeModel}
            disabled={!models.length || modelEnvOverridden || modelSaving}
          />
        }
        className="px-0 pb-0"
      />
      {modelEnvOverridden && (
        <div className="mt-1.5 text-center text-[11px] text-neutral-500">Model locked by environment.</div>
      )}
      <p className="mt-1.5 text-center text-[11px] text-neutral-400">Enter for a new line · Send runs Claw</p>
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
  const [selfState, setSelfState] = useState<SelfStateView | null>(null);
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>(DEFAULT_SUGGESTIONS);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false);
  const [computerOpen, setComputerOpen] = useState(false);
  const [forgeOpen, setForgeOpen] = useState(false);
  const [swarmOpen, setSwarmOpen] = useState(false);
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
    root.classList.toggle("dark", theme === "dark");
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

  const loadModel = useCallback(async () => {
    try {
      const r = await fetch("/api/claw/model", { cache: "no-store" });
      if (!r.ok) return;
      const d = await r.json();
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

  async function send(overrideText?: string) {
    if (busy) return;
    const body = (overrideText ?? text).trim();
    if (!body && !pendingFiles.length) return;
    setBusy(true); setError(null); setStreaming(""); setTools([]); setSelfState(null);
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
          if (e.type === "token" && !looksLikeInternalState(String(e.text || ""))) setStreaming(s => s + e.text);
          if (e.type === "status" && typeof e.text === "string") {
            setTools(t => {
              const last = t[t.length - 1];
              if (last && last.status === "running") return t.map((x, i) => i === t.length - 1 ? { ...x, label: e.text } : x);
              return [...t, { id: `status-${Date.now()}`, name: "status", label: e.text, status: "running", startedAt: Date.now() }];
            });
          }
          if (e.type === "tool_start") {
            setTools(t => [...t, { id: `${e.name}-${Date.now()}`, name: e.name, label: humanToolProgress(e.name), status: "running", startedAt: Date.now() }]);
            if (String(e.name).startsWith("computer_") || (e.name === "claw_dispatch" && /computer/i.test(String(e.args || "")))) {
              setComputerOpen(true);
              setForgeOpen(false);
              setSwarmOpen(false);
              setFilesOpen(false);
            }
            if (String(e.name).startsWith("forge_") || (e.name === "claw_dispatch" && /forge/i.test(String(e.args || "")))) {
              setForgeOpen(true);
              setComputerOpen(false);
              setSwarmOpen(false);
              setFilesOpen(false);
            }
            if (String(e.name).startsWith("swarm_") || (e.name === "claw_dispatch" && /swarm/i.test(String(e.args || "")))) {
              setSwarmOpen(true);
              setComputerOpen(false);
              setForgeOpen(false);
              setFilesOpen(false);
            }
          }
          if (e.type === "tool_end") setTools(t => t.map(x => x.name === e.name && x.status === "running" ? { ...x, status: e.ok ? "success" : "error", label: humanToolProgress(e.name), finishedAt: Date.now() } : x));
          if (e.type === "self_state") setSelfState({
            health: e.health, issue: e.issue, phase: e.phase, progress: e.progress,
            strategy: e.strategy, blockers: e.blockers, step: e.step, toolsRun: e.toolsRun
          });
          if (e.type === "error") setError(e.error);
          if (e.type === "done") {
            setStreaming("");
            const answer = sanitizeUserVisibleMessage(String(e.assistant || ""));
            if (answer) {
              setMessages((m) => [...m.filter((x) => x.id !== "local-assistant"), {
                id: "local-assistant",
                role: "assistant",
                content: answer,
                createdAt: new Date().toISOString()
              }]);
            }
          }
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
    setMessages([]); setStreaming(""); setTools([]); setSelfState(null); setPendingFiles([]);
    setSidebarOpen(false);
    await loadConvs();
  }

  async function removeThread(id: string) {
    if (!confirm("Delete this thread?")) return;
    await fetch(`/api/claw/conversations/${id}`, { method: "DELETE" });
    if (active === id) { setActive(null); setMessages([]); }
    await loadConvs();
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

  const visible = messages.filter(m =>
    m.role === "user" ||
    (m.role === "assistant" && !m.toolJson && isTranscriptAssistantContent(m.content))
  );
  const empty = !visible.length && !streaming && !busy;
  const activeTitle = convs.find(c => c.id === active)?.title;
  const threadMessages: AgentMessage[] = visible
    .filter((m): m is Msg & { role: "user" | "assistant" } => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      id: m.id,
      role: m.role,
      parts: [{ type: "text", text: m.content }],
    }));

  const composer = (
    <Composer
      text={text} setText={setText}
      pendingFiles={pendingFiles} setPendingFiles={setPendingFiles}
      busy={busy} onSend={(content) => void send(content)} onStop={stop}
      model={model} models={models} modelEnvOverridden={modelEnvOverridden}
      modelSaving={modelSaving} onChangeModel={changeModel}
      onAttach={() => fileInput.current?.click()}
    />
  );

  const trayBtn = (activeTray: boolean) =>
    `inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
      activeTray
        ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
        : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
    }`;

  return (
    <>
      <div className="claw-shell relative flex h-[100dvh] overflow-hidden overflow-x-hidden bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
        <input
          ref={fileInput}
          type="file"
          className="hidden"
          multiple
          accept="*/*"
          onChange={e => { void upload(e.target.files); e.target.value = ""; }}
        />

        {sidebarOpen && (
          <button type="button" aria-label="Close sidebar" onClick={() => setSidebarOpen(false)} className="fixed inset-0 z-30 bg-black/40 md:hidden" />
        )}
        <aside
          className={`fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col border-r border-neutral-200 bg-neutral-50 transition-transform duration-300 dark:border-neutral-800 dark:bg-neutral-950 md:static md:z-auto md:translate-x-0 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between px-4 py-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-950">
                <ClawLogo size={18} />
              </div>
              <div>
                <span className="text-[15px] font-semibold tracking-tight">Claw</span>
                <div className="text-[11px] text-neutral-500">Talk. Claw runs it.</div>
              </div>
            </div>
            <button type="button" onClick={() => setSidebarOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-800 md:hidden" aria-label="Close sidebar">
              <PanelLeftClose size={15} />
            </button>
          </div>

          <div className="px-3 pb-3">
            <button
              type="button"
              onClick={newThread}
              className="flex w-full items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-[13px] font-medium text-neutral-900 transition-colors hover:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
            >
              <Plus size={15} />
              New chat
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2">
            <div className="mb-1 px-2 py-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-400">Recent</div>
            {convs.map(c => (
              <div key={c.id} className={`group mb-0.5 flex items-center gap-1 rounded-lg px-2.5 py-2 text-[13px] transition-colors ${
                active === c.id
                  ? "bg-neutral-200/80 text-neutral-900 dark:bg-neutral-800 dark:text-white"
                  : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-900 dark:hover:text-neutral-100"
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
                  className="hidden h-6 w-6 shrink-0 items-center justify-center rounded-md text-neutral-400 hover:bg-rose-50 hover:text-rose-500 group-hover:flex dark:hover:bg-rose-950/40"
                  onClick={() => removeThread(c.id)}
                  aria-label="Delete thread"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
            {!convs.length && (
              <div className="px-2 py-8 text-center text-[12px] text-neutral-400">No conversations yet.</div>
            )}
          </div>

          <div className="border-t border-neutral-200 p-2 dark:border-neutral-800">
            <button
              type="button"
              onClick={() => {
                setFilesOpen(true);
                setComputerOpen(false);
                setForgeOpen(false);
                setSwarmOpen(false);
                setSidebarOpen(false);
              }}
              aria-label="Files"
              className="mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-900 dark:hover:text-neutral-100"
            >
              <FolderOpen size={14} />
              Files
            </button>
            <Link href="/computer" className="mb-0.5 flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-900 dark:hover:text-neutral-100">
              <Monitor size={14} />
              Computer
            </Link>
            <Link href="/routines" className="mb-0.5 flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-900 dark:hover:text-neutral-100">
              Routines
            </Link>
            <Link href="/integrations" className="mb-0.5 flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-900 dark:hover:text-neutral-100">
              <Plug size={14} />
              Integrations
            </Link>
            <Link href="/settings" className="mb-0.5 flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-900 dark:hover:text-neutral-100">
              <Settings size={14} />
              Settings
            </Link>
            <button
              type="button"
              onClick={() => setTheme(t => t === "dark" ? "light" : "dark")}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-900 dark:hover:text-neutral-100"
              aria-label={theme === "dark" ? "Light mode" : "Dark mode"}
            >
              {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </button>
          </div>
        </aside>

        <main className="relative flex min-w-0 flex-1 flex-col bg-white dark:bg-neutral-950">
          <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 border-b border-neutral-200 bg-white/90 px-3 backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-950/90">
            <button type="button" onClick={() => setSidebarOpen(true)} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 md:hidden" aria-label="Open sidebar">
              <Menu size={17} />
            </button>
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span className="truncate text-[14px] font-medium">
                {activeTitle || "New conversation"}
              </span>
              {busy && (
                <div className="flex items-center gap-1.5 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-500 dark:bg-neutral-800">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-900 dark:bg-white" />
                  working
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setFilesOpen((v) => !v);
                setComputerOpen(false);
                setForgeOpen(false);
                setSwarmOpen(false);
              }}
              aria-label="Files"
              className={trayBtn(filesOpen)}
            >
              <FolderOpen size={13} />
              Files
            </button>
            <button
              type="button"
              onClick={() => {
                setComputerOpen((v) => !v);
                setForgeOpen(false);
                setSwarmOpen(false);
                setFilesOpen(false);
              }}
              className={trayBtn(computerOpen)}
            >
              <Monitor size={13} />
              Computer
            </button>
          </header>

          <div className="flex min-h-0 flex-1">
            <section className="flex min-w-0 flex-1 flex-col">
              {empty ? (
                <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-4 py-10">
                  <div className="w-full max-w-[720px]">
                    <div className="mb-10 flex flex-col items-center gap-3 text-center">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-950">
                        <ClawLogo size={28} />
                      </div>
                      <div>
                        <h1 className="mb-1 text-2xl font-semibold tracking-tight">
                          <span suppressHydrationWarning>{greeting()}</span>, operator
                        </h1>
                        <p className="text-[14px] text-neutral-500">
                          Talk to me. I choose the agent, build it, and task it.
                        </p>
                      </div>
                    </div>

                    <div className="mb-8">{composer}</div>

                    <Suggestions
                      className="justify-center"
                      items={suggestions.slice(0, 6).map((s, i) => ({
                        id: `${s.source}-${s.skillIds?.[0] || s.label}-${i}`,
                        label: s.label,
                        value: s.prompt,
                        icon: s.source === "rag"
                          ? <Sparkles size={10} />
                          : s.source === "creative"
                            ? <Film size={10} />
                            : undefined,
                      }))}
                      onSelect={(item) => {
                        const s = suggestions.find(x => x.label === item.label);
                        if (s?.source === "creative") {
                          setCreativeModalOpen(true);
                          setCreativeUrl("");
                          return;
                        }
                        const prompt = item.value || s?.prompt || item.label;
                        setText(prompt);
                        void send(prompt);
                      }}
                    />
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex min-h-0 flex-1 flex-col">
                    <MessageList
                      messages={threadMessages}
                      scrollRef={scroller}
                      className="h-full"
                      footer={
                        <>
                          {(tools.length > 0 || busy || selfState || streaming) && (
                            <ClawThinkingPanel tools={tools} streaming={streaming} busy={busy} selfState={selfState} />
                          )}
                          {error && (
                            <AiMessageBubble role="assistant" content="" className="!max-w-full">
                              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[13px] text-rose-600 dark:text-rose-400">
                                {error}
                              </div>
                            </AiMessageBubble>
                          )}
                        </>
                      }
                    />
                  </div>
                  <div className="shrink-0 px-4 pb-4 pt-2">
                    <div className="mx-auto max-w-[720px]">
                      {error && empty === false && !streaming && (
                        <div className="mb-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-[12px] text-rose-600 dark:text-rose-400">
                          {error}
                        </div>
                      )}
                      {composer}
                    </div>
                  </div>
                </>
              )}
            </section>

            {computerOpen && (
              <aside className="fixed inset-y-0 right-0 z-40 flex w-[min(100vw,520px)] max-w-[100vw] flex-col border-l border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950 lg:static lg:z-auto lg:w-[min(46vw,560px)]">
                <ComputerDock variant="pane" onClose={() => setComputerOpen(false)} />
              </aside>
            )}
            {forgeOpen && (
              <aside className="fixed inset-y-0 right-0 z-40 flex w-[min(100vw,520px)] max-w-[100vw] flex-col overflow-y-auto border-l border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950 lg:static lg:z-auto lg:w-[min(46vw,560px)]">
                <ForgeConsole variant="pane" drivenByClaw onClose={() => setForgeOpen(false)} />
              </aside>
            )}
            {swarmOpen && (
              <aside className="fixed inset-y-0 right-0 z-40 flex w-[min(100vw,520px)] max-w-[100vw] flex-col overflow-y-auto border-l border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950 lg:static lg:z-auto lg:w-[min(46vw,560px)]">
                <SwarmConsole variant="pane" drivenByClaw onClose={() => setSwarmOpen(false)} />
              </aside>
            )}

            {filesOpen && (
              <button type="button" aria-label="Close files" onClick={() => setFilesOpen(false)} className="fixed inset-0 z-30 bg-black/30 lg:hidden" />
            )}
            <aside className={`fixed inset-y-0 right-0 z-40 w-80 max-w-[85vw] flex-col border-l border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950 lg:static lg:z-auto lg:w-80 ${filesOpen ? "flex" : "hidden"}`}>
              <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
                <div className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400">Files</div>
                <div className="flex items-center gap-1">
                  <button type="button" className="grid h-8 w-8 place-items-center rounded-lg text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800" onClick={() => fileInput.current?.click()} aria-label="Add file">
                    <FilePlus2 size={13} />
                  </button>
                  <button type="button" className="grid h-8 w-8 place-items-center rounded-lg text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800" onClick={() => setFilesOpen(false)} aria-label="Close files">
                    <X size={14} />
                  </button>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                {files.map(f => (
                  <div key={f.id} className="mb-2 rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
                    {renameId === f.id ? (
                      <div className="flex gap-1.5">
                        <input className="h-8 flex-1 rounded-lg border border-neutral-200 bg-white px-2.5 text-[12px] outline-none focus:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-900" value={renameVal} onChange={e => setRenameVal(e.target.value)} />
                        <button type="button" className="rounded-lg bg-neutral-900 px-3 text-[11px] font-medium text-white dark:bg-white dark:text-neutral-900" onClick={() => void saveRename(f.id)}>Save</button>
                      </div>
                    ) : (
                      <>
                        <a href={f.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 font-medium text-neutral-900 hover:underline dark:text-neutral-100">
                          <FolderOpen size={11} />{f.name}
                        </a>
                        <div className="mt-1 text-[10px] text-neutral-400">{f.mime} · {(f.size / 1024).toFixed(1)} KB</div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          <button type="button" className="rounded-md border border-neutral-200 px-2 py-0.5 text-[10px] text-neutral-500 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800" onClick={() => setPendingFiles(p => p.some(x => x.id === f.id) ? p : [...p, f])}>Attach</button>
                          <button type="button" className="rounded-md border border-neutral-200 px-2 py-0.5 text-[10px] text-neutral-500 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800" onClick={() => { setRenameId(f.id); setRenameVal(f.name); }}>
                            <Pencil size={9} className="mr-0.5 inline" />Rename
                          </button>
                          <button type="button" className="rounded-md border border-rose-200 px-2 py-0.5 text-[10px] text-rose-500 hover:bg-rose-50 dark:border-rose-900" onClick={() => void removeFile(f.id)}>Delete</button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
                {!files.length && <div className="py-10 text-center text-[12px] text-neutral-400">Upload files to attach them to a conversation.</div>}
              </div>
              {busy && (
                <div className="border-t border-neutral-200 px-4 py-2.5 dark:border-neutral-800">
                  <AILoader label="Working" variant="bar" className="text-[11px] text-neutral-400" />
                </div>
              )}
            </aside>
          </div>
        </main>
      </div>

      {creativeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button type="button" aria-label="Close" className="absolute inset-0 bg-black/50" onClick={() => setCreativeModalOpen(false)} />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xl dark:border-neutral-800 dark:bg-neutral-900">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-100 dark:bg-neutral-800">
                  <Film size={18} />
                </div>
                <div>
                  <h2 className="text-[15px] font-semibold">Create Ad Scripts</h2>
                  <p className="text-[11px] text-neutral-400">Powered by Claw + Steel</p>
                </div>
              </div>
              <button type="button" onClick={() => setCreativeModalOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800">
                <X size={14} />
              </button>
            </div>
            <p className="mb-4 text-[12px] leading-relaxed text-neutral-500">
              Claw will scrape your site and generate a complete short-form video ad script using a 13-step direct-response framework.
            </p>
            <input
              type="url"
              placeholder="https://yoursite.com"
              value={creativeUrl}
              onChange={e => setCreativeUrl(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && creativeUrl.trim()) void launchCreativeAds(); }}
              className="mb-4 w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-[14px] outline-none focus:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-950"
              autoFocus
            />
            <div className="flex gap-2">
              <button type="button" onClick={() => setCreativeModalOpen(false)} className="flex-1 rounded-xl border border-neutral-200 px-4 py-2.5 text-[13px] font-medium text-neutral-600 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-800">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void launchCreativeAds()}
                disabled={!creativeUrl.trim()}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-neutral-900 px-4 py-2.5 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-neutral-900"
              >
                <Wand2 size={14} />
                Generate
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
