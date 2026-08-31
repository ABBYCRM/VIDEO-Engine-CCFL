"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bird, Copy, FilePlus2, FolderOpen, Paperclip, Pencil, Plus, Send, Sparkles, Square, Trash2, X
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { Button } from "@/components/ui/button";
import AILoader from "@/components/ui/ai-loader";
import { ModelSelectorKit, type AiModel } from "@/components/ui/ai-model-select";

type Conv = { id: string; title: string; createdAt: string; updatedAt: string };
type Msg = { id: string; role: "user" | "assistant" | "tool" | "system"; content: string; toolJson?: any; createdAt: string };
type ClawFile = { id: string; name: string; mime: string; size: number; url: string };
type ToolChip = { name: string; ok?: boolean; via?: string; preview?: string; running?: boolean; decision?: "DEFER" | "REJECT" };

type Suggestion = { label: string; prompt: string; source: "tool" | "rag" | "category"; category?: string; skillIds?: string[] };

// The Claw "starter" prompts are RAG-driven: a /api/claw/suggestions
// endpoint walks the dev-skills corpus and returns both tool-driven
// prompts (each maps to a real Claw tool) and RAG-driven prompts
// (each opens a record from the curated dev knowledge). The component
// fetches on mount, caches in state, and renders the buttons; if the
// fetch fails (or before it resolves) the inline DEFAULT_SUGGESTIONS
// below stand in. The new prompts are deliberately code-grounded
// (TypeScript narrowing, SQL escape, OAuth2 PKCE, OWASP top 10, etc.)
// not the generic "communicate clearly" filler the operator
// specifically told us to leave out.
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

export function ClawConsole() {
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
  const [pane, setPane] = useState<"chat" | "threads" | "files">("chat");
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const [models, setModels] = useState<{ id: string; label: string; notes: string; contextWindow: number }[]>([]);
  const [model, setModel] = useState<string | null>(null);
  const [modelEnvOverridden, setModelEnvOverridden] = useState(false);
  const [modelSaving, setModelSaving] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

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
    // RAG-driven starter prompts. Fetches on mount; on failure falls
    // back to the hardcoded DEFAULT_SUGGESTIONS in state.
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
    setPane("chat");
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

  return (
    <AuthGuard>
      <AppShell>
        <div className="flex h-[calc(100dvh-7rem)] flex-col">
          <header className="flex flex-col gap-2 border-b border-slate-200 bg-white px-3 py-2">
            <div className="flex items-center gap-2">
              <Bird size={16} className="shrink-0 text-violet-600" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold tracking-tight">Claw</div>
                <div className="truncate text-[11px] text-slate-500">NVIDIA operator agent · Steel web research · Graph Instagram</div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ModelSelectorKit
                aria-label={modelEnvOverridden ? "Model is fixed by the CLAW_NVIDIA_MODEL environment variable" : "Choose the NVIDIA model Claw uses"}
                models={aiModels}
                value={model ? { id: model } : undefined}
                onValueChange={(sel) => void changeModel(sel.id)}
                disabled={!models.length || modelEnvOverridden || modelSaving}
              />
              <button type="button" className="rounded-lg border px-2 py-1 text-xs" onClick={() => setPane(pane === "threads" ? "chat" : "threads")}>Threads</button>
              <button type="button" className="rounded-lg border px-2 py-1 text-xs" onClick={() => setPane(pane === "files" ? "chat" : "files")}>Files</button>
              <Button size="sm" variant="secondary" onClick={newThread}><Plus size={14} className="mr-1" />New</Button>
            </div>
          </header>

          <div className="flex min-h-0 flex-1">
            <aside className={`${pane === "threads" ? "flex" : "hidden"} w-full flex-col border-r border-slate-200 bg-white`}>
              <div className="border-b px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Threads</div>
              <div className="flex-1 overflow-y-auto p-2">
                {convs.map((c) => (
                  <div key={c.id} className={`group mb-1 flex items-center gap-1 rounded-xl px-2 py-2 text-sm ${active === c.id ? "bg-violet-50 font-semibold text-violet-800" : "hover:bg-slate-50"}`}>
                    <button type="button" className="min-w-0 flex-1 truncate text-left" onClick={() => { setActive(c.id); setPane("chat"); }}>{c.title}</button>
                    <button type="button" className="hidden h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 group-hover:grid" onClick={() => removeThread(c.id)} aria-label="Delete thread"><Trash2 size={13} /></button>
                  </div>
                ))}
                {!convs.length && <div className="px-2 py-6 text-center text-xs text-slate-500">No threads yet.</div>}
              </div>
            </aside>

            <section className={`${pane === "chat" ? "flex" : "hidden"} min-w-0 flex-1 flex-col`}>
              <div ref={scroller} className="flex-1 overflow-y-auto px-3 py-4 sm:px-6">
                {!visible.length && !streaming && (
                  <div className="mx-auto max-w-xl rounded-2xl border border-violet-100 bg-violet-50/60 p-5">
                    <div className="text-base font-semibold text-violet-900">Talk to Claw</div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      {suggestions.map((s, i) => (
                        <button
                          key={`${s.source}-${s.skillIds?.[0] || s.label}-${i}`}
                          type="button"
                          title={s.source === "rag" && s.skillIds ? `From dev-skill: ${s.skillIds.join(", ")}` : s.source === "tool" ? "Calls a real Claw tool" : "Starter"}
                          className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-white px-3 py-1 text-violet-800"
                          onClick={() => setText(s.prompt)}
                        >
                          {s.source === "rag" ? <Sparkles size={10} className="text-violet-500"/> : null}
                          <span>{s.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="mx-auto flex max-w-[440px] flex-col gap-3">
                  {visible.map((m) => (
                    <div key={m.id} className={`group flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[92%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${m.role === "user" ? "bg-violet-600 text-white" : "border border-slate-200 bg-white text-slate-800"}`}>
                        <div className="whitespace-pre-wrap">{m.content}</div>
                        <div className={`mt-1 hidden gap-1 group-hover:flex ${m.role === "user" ? "justify-end" : ""}`}>
                          <button type="button" className="rounded p-1 opacity-70 hover:opacity-100" onClick={() => navigator.clipboard.writeText(m.content)} aria-label="Copy"><Copy size={12} /></button>
                          <button type="button" className="rounded p-1 opacity-70 hover:opacity-100" onClick={() => removeMessage(m.id)} aria-label="Delete message"><Trash2 size={12} /></button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {tools.map((t, i) => {
                    // A DEFER/REJECT is Claw deliberately pausing for the
                    // operator's confirmation, not a failure — rendering it
                    // identically to "Failed" (as this used to) is actively
                    // misleading, not just an open UX question.
                    const label = t.running
                      ? "Running"
                      : t.decision === "DEFER"
                        ? "Needs confirmation:"
                        : t.decision === "REJECT"
                          ? "Blocked:"
                          : t.ok ? "Did" : "Failed";
                    const isPause = t.decision === "DEFER" || t.decision === "REJECT";
                    return (
                      <div key={`${t.name}-${i}`} className={`rounded-xl border px-3 py-2 text-xs ${isPause ? "border-sky-200 bg-sky-50 text-sky-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
                        <span className="font-semibold">{label} {t.name}</span>
                        {t.via ? <span className="ml-2 rounded bg-white px-1.5 py-0.5">via {t.via}</span> : null}
                        {t.preview ? <div className={`mt-1 line-clamp-3 font-mono text-[11px] ${isPause ? "text-sky-800" : "text-amber-800"}`}>{t.preview}</div> : null}
                      </div>
                    );
                  })}
                  {streaming && <div className="max-w-[92%] rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm whitespace-pre-wrap">{streaming}<span className="ml-0.5 inline-block h-3 w-1 animate-pulse bg-violet-500" /></div>}
                  {busy && !streaming && (
                    <div className="flex justify-start">
                      <div className="max-w-[92%] rounded-2xl border border-slate-200 bg-white px-3 py-2">
                        <AILoader label="Thinking" showElapsed variant="dots" />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t border-slate-200 bg-white p-3">
                {error && <div className="mb-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
                {pendingFiles.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1">
                    {pendingFiles.map((f) => (
                      <span key={f.id} className="inline-flex items-center gap-1 rounded-full border bg-slate-50 px-2 py-1 text-[11px]">
                        {f.name}
                        <button type="button" onClick={() => setPendingFiles((p) => p.filter((x) => x.id !== f.id))} aria-label="Remove"><X size={11} /></button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="mx-auto flex max-w-[440px] items-end gap-2">
                  <input ref={fileInput} type="file" className="hidden" multiple onChange={(e) => { void upload(e.target.files); e.target.value = ""; }} />
                  <button type="button" className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50" onClick={() => fileInput.current?.click()} aria-label="Upload files"><Paperclip size={16} /></button>
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
                    rows={1}
                    placeholder="Ask Claw to generate, post, read comments, DMs…"
                    className="min-h-10 flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-400"
                  />
                  {busy
                    ? <Button onClick={stop} variant="danger"><Square size={14} className="mr-1" />Stop</Button>
                    : <Button onClick={() => void send()} disabled={!text.trim() && !pendingFiles.length}><Send size={14} className="mr-1" />Send</Button>}
                </div>
              </div>
            </section>

            <aside className={`${pane === "files" ? "flex" : "hidden"} w-full flex-col border-l border-slate-200 bg-white`}>
              <div className="flex items-center justify-between border-b px-3 py-2">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Files</div>
                <button type="button" className="grid h-8 w-8 place-items-center rounded-lg border text-slate-600" onClick={() => fileInput.current?.click()} aria-label="Add file"><FilePlus2 size={14} /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                {files.map((f) => (
                  <div key={f.id} className="mb-2 rounded-xl border border-slate-200 p-2 text-xs">
                    {renameId === f.id ? (
                      <div className="flex gap-1">
                        <input className="h-8 flex-1 rounded border px-2" value={renameVal} onChange={(e) => setRenameVal(e.target.value)} />
                        <Button size="sm" onClick={() => void saveRename(f.id)}>Save</Button>
                      </div>
                    ) : (
                      <>
                        <a href={f.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-medium text-violet-800 hover:underline">
                          <FolderOpen size={12} />{f.name}
                        </a>
                        <div className="mt-1 text-[10px] text-slate-500">{f.mime} · {(f.size / 1024).toFixed(1)} KB</div>
                        <div className="mt-1 flex gap-1">
                          <button type="button" className="rounded border px-2 py-0.5" onClick={() => setPendingFiles((p) => p.some((x) => x.id === f.id) ? p : [...p, f])}>Attach</button>
                          <button type="button" className="rounded border px-2 py-0.5" onClick={() => { setRenameId(f.id); setRenameVal(f.name); }}><Pencil size={10} className="inline" /> Rename</button>
                          <button type="button" className="rounded border border-rose-200 px-2 py-0.5 text-rose-700" onClick={() => void removeFile(f.id)}>Delete</button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
                {!files.length && <div className="px-2 py-6 text-center text-xs text-slate-500">Upload briefs, scripts, stills. Claw can read and attach them to generate/post.</div>}
              </div>
              {busy && <div className="border-t px-3 py-2"><AILoader label="Working" variant="bar" className="text-xs text-slate-500" /></div>}
            </aside>
          </div>
        </div>
      </AppShell>
    </AuthGuard>
  );
}
