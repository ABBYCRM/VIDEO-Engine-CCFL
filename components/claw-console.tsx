"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bird, Copy, FilePlus2, FolderOpen, Paperclip, Pencil, Plus, Send, Sparkles, Square, Trash2, X
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { Button } from "@/components/ui/button";
import AILoader from "@/components/ui/ai-loader";

type Conv = { id: string; title: string; createdAt: string; updatedAt: string };
type Msg = { id: string; role: "user" | "assistant" | "tool" | "system"; content: string; toolJson?: any; createdAt: string };
type ClawFile = { id: string; name: string; mime: string; size: number; url: string };
type ToolChip = { name: string; ok?: boolean; via?: string; preview?: string; running?: boolean; decision?: "DEFER" | "REJECT" };

// The Autopilot button is a fully autonomous one-click action. It fires
// two direct pipeline calls (Reddit market-research + Site/IG autopilot)
// in parallel. Each pipeline makes its own decisions end to end:
//   - Reddit:        scan + anonymize + theme-classify + fresh-scene-author
//                    + still-render + caption-from-library + publish-now
//   - Site/IG:       steel_scrape caseclosedfl.com + category-rotate +
//                    fresh-scene-author + still-render + caption-from-library
//                    + publish-now
// Both gate themselves on connection state + the shared daily generation
// cap, and either returns a specific reason on skip/fail. They bypass
// Claw's chat loop on purpose: the operator is gone after pressing the
// button, so a CONFIRM round-trip is the wrong shape here.
//
// A chat turn (the AUTOPILOT_PROMPT below, plus anything the operator
// types) is for operator-in-the-loop drafting. It runs through the AION
// gate and the daily cap, and any EXTERNAL_POST tool it wants to fire
// (publish_calendar, ig_publish, x_post, ...) is held until the
// operator replies "CONFIRM <tool_name>". The two pipelines above are
// not "smarter chat turns" — they are deliberately the part of the
// system that does not ask.
const AUTOPILOT_PROMPT = `Run the brand-consistent Instagram content task:
1. Use steel_scrape on caseclosedfl.com (homepage and one or two other key pages) to confirm the current brand voice and messaging.
2. Call ig_list_media to see recent posts, then use ig_analyze_media on a handful of likely candidates (narrow first by caption/date, don't analyze every post) to find which existing posts use the Pixar-style 3D cartoon look (navy side panel, orange CaseClosedFL.com footer bar, animated character/vehicle scene) versus other styles.
3. Generate at most 3 NEW still images matching that same look using generate_still with a cartoon-* stillTemplateId (or category) — do not invent a different "Pixar style" prompt from scratch, use the existing template system.
4. Write matching captions in the site's brand voice and save each as a draft Calendar post (save_post) — do NOT publish them.
5. Report back what you found and what you drafted. If you hit the daily generation cap partway through, stop and tell me instead of retrying.`;

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
  const [redditRunStatus, setRedditRunStatus] = useState<string | null>(null);
  const [redditRunBusy, setRedditRunBusy] = useState(false);
  const [siteRunStatus, setSiteRunStatus] = useState<string | null>(null);
  const [siteRunBusy, setSiteRunBusy] = useState(false);
  const [autopilotEnabled, setAutopilotEnabledState] = useState<boolean | null>(null);
  const [autopilotToggling, setAutopilotToggling] = useState(false);
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

  // Fires the Reddit market-research pipeline directly (bypassing Claw's
  // chat/AION loop, same pattern as Calendar's "Run autopilot" button) so
  // one click actually goes live and the operator can check the outcome
  // immediately, instead of needing a follow-up "CONFIRM" reply.
  async function runRedditResearchNow() {
    setRedditRunBusy(true);
    setRedditRunStatus("Reddit research: scanning…");
    try {
      const r = await fetch("/api/admin/reddit-research/run-now", { method: "POST" });
      const d = await r.json();
      if (!r.ok) { setRedditRunStatus(`Reddit research failed: ${d.error || r.status}`); return; }
      if (d.status === "success") {
        setRedditRunStatus(d.published ? `Posted live — ${d.category} (check Instagram)` : `Queued — ${d.category} (publishing within the minute)`);
      } else if (d.status === "skipped") {
        setRedditRunStatus(`Skipped: ${d.reason}`);
      } else {
        setRedditRunStatus(`Failed: ${d.reason || "unknown error"}`);
      }
    } catch (e) {
      setRedditRunStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setRedditRunBusy(false);
    }
  }

  // Fires the Site/IG autopilot pipeline directly — same rationale as
  // runRedditResearchNow above (bypasses chat/AION, publishes for real,
  // reports the outcome immediately).
  async function runSiteAutopilotNow() {
    setSiteRunBusy(true);
    setSiteRunStatus("Site autopilot: generating…");
    try {
      const r = await fetch("/api/admin/site-autopilot/run-now", { method: "POST" });
      const d = await r.json();
      if (!r.ok) { setSiteRunStatus(`Site autopilot failed: ${d.error || r.status}`); return; }
      if (d.status === "success") {
        setSiteRunStatus(d.published ? `Posted live — ${d.category} (check Instagram)` : `Queued — ${d.category} (publishing within the minute)`);
      } else if (d.status === "skipped") {
        setSiteRunStatus(`Skipped: ${d.reason}`);
      } else {
        setSiteRunStatus(`Failed: ${d.reason || "unknown error"}`);
      }
    } catch (e) {
      setSiteRunStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setSiteRunBusy(false);
    }
  }

  function runAutopilot() {
    // One click, fully autonomous: the operator is gone after this press.
    // No chat turn, no "CONFIRM" round-trip — the two direct pipeline
    // calls below are already designed to make every decision themselves
    // (Reddit anonymization + theme classification + caption-from-library;
    // Site-IG steel_scrape + category rotation + pre-approved caption;
    // both gated by the daily generation cap + the connection-state
    // preflight, both ending in a real published post when every gate
    // passes). Anything that can't go live comes back with a specific
    // reason in the on-screen status text.
    //
    // The chat turn was previously also fired from this button, but the
    // operator-directive 2026-08-30 ("once I hit it it has to act fully
    // independent, no follow-up") makes a chat turn the wrong shape here:
    // it would block on the first EXTERNAL_POST tool that needs CONFIRM,
    // the model would surface a pause request, and the operator (gone)
    // never replies. The two direct pipelines don't have that problem
    // because they bypass Claw's chat/AION loop by design.
    void runRedditResearchNow();
    void runSiteAutopilotNow();
  }

  const loadAutopilotState = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/autopilot");
      if (r.ok) setAutopilotEnabledState((await r.json()).enabled);
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { void loadAutopilotState(); }, [loadAutopilotState]);

  async function toggleAutopilot() {
    if (autopilotEnabled === null) return;
    setAutopilotToggling(true);
    try {
      const r = await fetch("/api/admin/autopilot", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled: !autopilotEnabled }) });
      if (r.ok) setAutopilotEnabledState((await r.json()).enabled);
    } finally {
      setAutopilotToggling(false);
    }
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
    // Only clear the box for a normal send — an override (Autopilot) sends
    // its own text without touching whatever draft the operator was typing.
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
              <button
                type="button"
                disabled={autopilotEnabled === null || autopilotToggling}
                onClick={toggleAutopilot}
                title={autopilotEnabled ? "Autopilot is running (Reddit + Site/IG pipelines). Click to stop — same as typing \"stop\" to Claw." : "Autopilot is paused. Click to resume — same as typing \"start\" to Claw."}
                className={`flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium disabled:opacity-50 ${autopilotEnabled ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-300 bg-slate-100 text-slate-500"}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${autopilotEnabled ? "bg-emerald-500" : "bg-slate-400"}`} />
                {autopilotEnabled === null ? "…" : autopilotEnabled ? "Auto: On" : "Auto: Off"}
              </button>
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
                    <p className="mt-1 text-sm text-slate-600">Same controls as this Grok thread: new, delete, upload, files. Claw can research the public web with Steel, generate, post, read IG comments, and DMs. Composio runs first; direct Graph is the reported fallback.</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      {["Research a public URL with Steel", "Read today’s Instagram comments", "What’s stuck in Pipeline?", "Approve pending Calendar slots"].map((q) => (
                        <button key={q} type="button" className="rounded-full border border-violet-200 bg-white px-3 py-1 text-violet-800" onClick={() => setText(q)}>{q}</button>
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
                {redditRunStatus && (
                  <div className="mx-auto mb-2 max-w-[440px] rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-800">
                    {redditRunBusy && <span className="mr-1 inline-block animate-pulse">●</span>}
                    Reddit: {redditRunStatus}
                  </div>
                )}
                {siteRunStatus && (
                  <div className="mx-auto mb-2 max-w-[440px] rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-800">
                    {siteRunBusy && <span className="mr-1 inline-block animate-pulse">●</span>}
                    Site: {siteRunStatus}
                  </div>
                )}
                <div className="mx-auto flex max-w-[440px] items-end gap-2">
                  <input ref={fileInput} type="file" className="hidden" multiple onChange={(e) => { void upload(e.target.files); e.target.value = ""; }} />
                  <button type="button" className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50" onClick={() => fileInput.current?.click()} aria-label="Upload files"><Paperclip size={16} /></button>
                  <button
                    type="button"
                    disabled={busy || redditRunBusy}
                    className="grid h-10 w-10 place-items-center rounded-xl border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 disabled:opacity-50"
                    onClick={runAutopilot}
                    aria-label="Autopilot: brand-consistent Instagram content task + live Reddit-driven post"
                    title="Autopilot: drafts up to 3 site/IG-matched stills (never auto-published) AND immediately runs the Reddit market-research pipeline, which posts live so you can check the outcome right away"
                  >
                    <Sparkles size={16} />
                  </button>
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
