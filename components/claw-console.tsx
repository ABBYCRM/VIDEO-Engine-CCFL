"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bird, Copy, FilePlus2, FolderOpen, Loader2, Paperclip, Pencil, Plus, Send, Square, Trash2, X
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { Button } from "@/components/ui/button";

type Conv = { id: string; title: string; createdAt: string; updatedAt: string };
type Msg = { id: string; role: "user" | "assistant" | "tool" | "system"; content: string; toolJson?: any; createdAt: string };
type ClawFile = { id: string; name: string; mime: string; size: number; url: string };
type ToolChip = { name: string; ok?: boolean; via?: string; preview?: string; running?: boolean };

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
  const [error, setError] = useState<string | null>(null);
  const [pane, setPane] = useState<"chat" | "threads" | "files">("chat");
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
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

  async function send() {
    if (busy) return;

    const body = text.trim();
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
    setText("");
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
          if (e.type === "tool_end") setTools((t) => t.map((x) => x.name === e.name && x.running ? { ...x, running: false, ok: e.ok, via: e.via, preview: e.preview } : x));
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
      <AppShell fullBleed>
        <div className="flex h-[calc(100dvh-3.25rem)] flex-col md:h-screen">
          <header className="flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
            <Bird size={16} className="text-violet-600" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold tracking-tight">Claw</div>
              <div className="truncate text-[11px] text-slate-500">NVIDIA operator agent · Steel web research · Graph Instagram</div>
            </div>
            <button type="button" className="rounded-lg border px-2 py-1 text-xs md:hidden" onClick={() => setPane(pane === "threads" ? "chat" : "threads")}>Threads</button>
            <button type="button" className="rounded-lg border px-2 py-1 text-xs md:hidden" onClick={() => setPane(pane === "files" ? "chat" : "files")}>Files</button>
            <Button size="sm" variant="secondary" onClick={newThread}><Plus size={14} className="mr-1" />New</Button>
          </header>

          <div className="flex min-h-0 flex-1">
            <aside className={`${pane === "threads" ? "flex" : "hidden"} w-full flex-col border-r border-slate-200 bg-white md:flex md:w-64`}>
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

            <section className={`${pane === "chat" ? "flex" : "hidden"} min-w-0 flex-1 flex-col md:flex`}>
              <div ref={scroller} className="flex-1 overflow-y-auto px-3 py-4 sm:px-6">
                {!visible.length && !streaming && (
                  <div className="mx-auto max-w-xl rounded-2xl border border-violet-100 bg-violet-50/60 p-5">
                    <div className="text-base font-semibold text-violet-900">Talk to Claw</div>
                    <p className="mt-1 text-sm text-slate-600">Same controls as this Grok thread: new, delete, upload, files. Claw can research the public web with Steel, generate, post, read IG comments, and DMs. Graph first — if MCP fails it uses Composio and tells you.</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      {["Research a public URL with Steel", "Read today’s Instagram comments", "What’s stuck in Pipeline?", "Approve pending Calendar slots"].map((q) => (
                        <button key={q} type="button" className="rounded-full border border-violet-200 bg-white px-3 py-1 text-violet-800" onClick={() => setText(q)}>{q}</button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="mx-auto flex max-w-3xl flex-col gap-3">
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
                  {tools.map((t, i) => (
                    <div key={`${t.name}-${i}`} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      <span className="font-semibold">{t.running ? "Running" : t.ok ? "Did" : "Failed"} {t.name}</span>
                      {t.via ? <span className="ml-2 rounded bg-white px-1.5 py-0.5">via {t.via}</span> : null}
                      {t.preview ? <div className="mt-1 line-clamp-3 font-mono text-[11px] text-amber-800">{t.preview}</div> : null}
                    </div>
                  ))}
                  {streaming && <div className="max-w-[92%] rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm whitespace-pre-wrap">{streaming}<span className="ml-0.5 inline-block h-3 w-1 animate-pulse bg-violet-500" /></div>}
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
                <div className="mx-auto flex max-w-3xl items-end gap-2">
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

            <aside className={`${pane === "files" ? "flex" : "hidden"} w-full flex-col border-l border-slate-200 bg-white lg:flex lg:w-72`}>
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
              {busy && <div className="flex items-center gap-2 border-t px-3 py-2 text-xs text-slate-500"><Loader2 size={12} className="animate-spin" /> Working…</div>}
            </aside>
          </div>
        </div>
      </AppShell>
    </AuthGuard>
  );
}
