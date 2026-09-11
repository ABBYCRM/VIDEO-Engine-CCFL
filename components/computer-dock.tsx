"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, Maximize2, Monitor, Pause, Play, RotateCcw, X } from "lucide-react";
import { mapContainedClick, pointerOffset } from "@/lib/browser-computer/screen-map";

type SteelHit = { title: string; url: string; snippet?: string };

type Session = {
  id: string;
  status: string;
  controlOwner: string;
  url: string;
  title: string;
  screenshotJpeg: string | null;
  handoffReason: string | null;
  lastAction: string | null;
  lastSearchQuery?: string | null;
  pointer: { x: number; y: number } | null;
  events?: Array<{ actor: string; eventType: string; note: string }>;
};

export function ComputerDock({
  variant = "pane",
  onClose,
}: {
  variant?: "pane" | "page";
  onClose?: () => void;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [typeBuf, setTypeBuf] = useState("");
  const [booting, setBooting] = useState(true);
  const [steelHits, setSteelHits] = useState<SteelHit[]>([]);
  const [steelNote, setSteelNote] = useState<string | null>(null);
  const [steelBusy, setSteelBusy] = useState(false);
  const screenRef = useRef<HTMLImageElement | null>(null);
  const [screenBox, setScreenBox] = useState({ width: 1280, height: 800 });

  async function call(op: string, extra: Record<string, unknown> = {}) {
    const res = await fetch("/api/computer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op, ...extra }),
    });
    const body = await res.json();
    if (!body.ok && !body.results) setError(body.error || "failed");
    else setError(null);
    if (body.session) setSession(body.session);
    return body;
  }

  useEffect(() => {
    let alive = true;
    call("boot")
      .catch((e) => setError(e instanceof Error ? e.message : "boot failed"))
      .finally(() => {
        if (alive) setBooting(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const tick = () => {
      fetch("/api/computer")
        .then((r) => r.json())
        .then((b) => {
          if (alive && b.session) setSession(b.session);
        })
        .catch(() => undefined);
    };
    const t = setInterval(tick, session?.controlOwner === "AGENT" ? 700 : 1800);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [session?.controlOwner]);

  const human = session?.controlOwner === "HUMAN";
  const agent = session?.controlOwner === "AGENT";

  function measure() {
    const el = screenRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setScreenBox({ width: r.width, height: r.height });
  }

  function onScreenPointer(e: React.PointerEvent<HTMLImageElement>) {
    if (!human || !session) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const mapped = mapContainedClick({ clientX: e.clientX, clientY: e.clientY, rect });
    if (!mapped) return;
    void call("action", { actor: "human", action: { type: "click", x: mapped.x, y: mapped.y } });
  }

  async function typeAsHuman() {
    if (!human || !typeBuf.trim()) return;
    await call("action", { actor: "human", action: { type: "type", text: typeBuf } });
    setTypeBuf("");
  }

  async function steelSearch() {
    const q =
      session?.lastSearchQuery ||
      session?.events?.find((ev) => ev.eventType === "search")?.note?.replace(/^search\s+"|"$/g, "") ||
      "";
    if (!q.trim()) {
      setError("No search query on this session yet");
      return;
    }
    setSteelBusy(true);
    try {
      const body = await call("steel_search", { query: q.trim() });
      const hits = Array.isArray(body.results) ? body.results : [];
      setSteelHits(hits);
      setSteelNote(
        body.via
          ? `Steel ${body.via}${body.solvedCaptcha ? " solved the puzzle in a cloud browser" : " used a proxy"}. Chrome is still on this tab.`
          : body.error || "Steel returned no results",
      );
      if (!body.ok && body.error) setError(body.error);
    } finally {
      setSteelBusy(false);
    }
  }

  async function openHit(url: string) {
    await call("action", { actor: "human", action: { type: "navigate", url } });
  }

  const steps = (session?.events ?? []).filter((ev) => ev.actor === "agent").slice(0, 6);
  const pin = session?.pointer
    ? pointerOffset(session.pointer.x, session.pointer.y, screenBox)
    : null;

  return (
    <div className={`flex min-h-0 flex-col ${variant === "page" ? "min-h-[70vh]" : "h-full"}`}>
      <div className="flex flex-wrap items-center gap-2 border-b border-[rgba(180,180,255,0.08)] px-3 py-2.5">
        <Monitor size={14} className="text-[var(--claw-accent)]" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-[11px] text-muted-foreground">
            {session?.url || "about:blank"}
          </p>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 font-mono text-[10px] tracking-wide ${
            human
              ? "bg-[rgba(214,181,109,0.15)] text-[#d6b56d]"
              : agent
                ? "bg-[rgba(143,191,163,0.15)] text-[#8fbfa3]"
                : "text-muted-foreground"
          }`}
        >
          {human ? "YOU" : agent ? "CLAW" : "IDLE"}
        </span>
        {(human || agent) && (
        <button
          type="button"
          className="rounded-lg border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
          onClick={() => call(human ? "resume" : "takeover")}
        >
          {human ? <Play size={11} className="inline" /> : <Pause size={11} className="inline" />}{" "}
          {human ? "Return" : "Take over"}
        </button>
        )}
        {human && (
        <button
          type="button"
          className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:text-foreground"
          onClick={() => call("reset")}
          aria-label="Restart computer"
        >
          <RotateCcw size={13} />
        </button>
        )}
        {variant === "pane" && (
          <>
            <Link
              href="/computer"
              className="grid h-8 w-8 place-items-center rounded-lg text-[rgba(220,220,255,0.4)] hover:text-[rgba(220,220,255,0.85)]"
              aria-label="Open computer full page"
            >
              <Maximize2 size={13} />
            </Link>
            {onClose && (
              <button
                type="button"
                className="grid h-8 w-8 place-items-center rounded-lg text-[rgba(220,220,255,0.4)] hover:text-[rgba(220,220,255,0.85)]"
                onClick={onClose}
                aria-label="Close computer"
              >
                <X size={14} />
              </button>
            )}
          </>
        )}
      </div>

      <div className="relative min-h-0 flex-1 overflow-auto bg-black">
        {booting && (
          <div className="absolute inset-0 grid place-items-center text-[rgba(220,220,255,0.4)]">
            <Loader2 className="size-5 animate-spin" />
          </div>
        )}
        {session?.screenshotJpeg ? (
          <div className="relative w-full" style={{ aspectRatio: "1280 / 800" }}>
            <img
              ref={screenRef}
              alt={session.title || "Computer"}
              src={`data:image/jpeg;base64,${session.screenshotJpeg}`}
              className={`absolute inset-0 h-full w-full touch-manipulation object-fill ${human ? "cursor-crosshair" : ""}`}
              onPointerDown={onScreenPointer}
              onLoad={measure}
              draggable={false}
            />
            {pin && (
              <span
                className="pointer-events-none absolute size-3 rounded-full border-2 border-[var(--claw-accent)] bg-[var(--claw-accent)]/40"
                style={{ left: pin.left, top: pin.top, transform: "translate(-50%, -50%)" }}
              />
            )}
          </div>
        ) : (
          !booting && (
            <p className="p-6 text-[12px] text-[rgba(220,220,255,0.35)]">
              Screen appears when Claw tasks the Computer agent. Ask Claw in chat — do not drive this Chrome unless Claw hands you a CAPTCHA.
            </p>
          )
        )}
        {human && session?.handoffReason && (
          <div className="pointer-events-none absolute inset-x-3 top-3 rounded-lg border border-[rgba(214,181,109,0.4)] bg-[rgba(8,8,20,0.92)] px-3 py-2 text-[12px] text-[#d6b56d]">
            <p className="pointer-events-none">
              Claw paused: {session.handoffReason}. Tap the puzzle on the screen
              {session.handoffReason === "captcha" ? " (the duck square), skip it with Steel, or open Forge (no solver)." : ", then return control."}
            </p>
            {session.handoffReason === "captcha" && (
              <div className="pointer-events-auto mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-md bg-[#d6b56d] px-3 py-1.5 text-[12px] font-medium text-[#1a1408]"
                  onClick={() => void steelSearch()}
                  disabled={steelBusy}
                >
                  {steelBusy ? "Steel searching…" : "Skip puzzle — search with Steel"}
                </button>
              </div>
            )}
          </div>
        )}
        {agent && (
          <div className="pointer-events-none absolute inset-x-3 top-3 rounded-lg border border-[rgba(143,191,163,0.3)] bg-[rgba(8,8,20,0.88)] px-3 py-1.5 text-[11px] text-[#8fbfa3]">
            Claw is using the computer
            {session?.lastAction ? ` · ${session.lastAction}` : ""}
          </div>
        )}
      </div>

      {steelNote && (
        <div className="border-t border-[rgba(180,180,255,0.08)] px-3 py-2 text-[12px] text-[rgba(220,220,255,0.7)]">
          {steelNote}
          {steelHits.length > 0 && (
            <ul className="mt-2 space-y-1">
              {steelHits.map((hit) => (
                <li key={hit.url}>
                  <button
                    type="button"
                    className="text-left text-[12px] text-[var(--claw-accent)] underline"
                    onClick={() => void openHit(hit.url)}
                  >
                    {hit.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && <p className="px-3 py-1.5 text-[12px] text-rose-400">{error}</p>}

      {human && (
        <form
          className="flex gap-2 border-t border-[rgba(180,180,255,0.08)] p-2"
          onSubmit={(e) => {
            e.preventDefault();
            void typeAsHuman();
          }}
        >
          <input
            value={typeBuf}
            onChange={(e) => setTypeBuf(e.target.value)}
            placeholder="Type into the focused field"
            className="h-10 flex-1 rounded-lg border border-[rgba(180,180,255,0.15)] bg-[rgba(255,255,255,0.05)] px-3 text-[13px] text-[rgba(220,220,255,0.9)] outline-none"
          />
          <button type="submit" className="rounded-lg bg-[var(--claw-accent)] px-3 text-[12px] font-medium text-[rgba(5,5,15,0.95)]">
            Type
          </button>
        </form>
      )}

      {steps.length > 0 && (
        <div className="hidden gap-2 overflow-x-auto border-t border-[rgba(180,180,255,0.08)] px-3 py-1.5 font-mono text-[10px] text-[rgba(220,220,255,0.35)] md:flex">
          {steps.map((ev, i) => (
            <span key={`${ev.eventType}-${i}`}>
              {ev.eventType}: {ev.note}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
