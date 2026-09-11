"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Maximize2, Monitor, Pause, Play, RotateCcw, X } from "lucide-react";

type Session = {
  id: string;
  status: string;
  controlOwner: string;
  url: string;
  title: string;
  screenshotJpeg: string | null;
  handoffReason: string | null;
  lastAction: string | null;
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

  async function call(op: string, extra: Record<string, unknown> = {}) {
    const res = await fetch("/api/computer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op, ...extra }),
    });
    const body = await res.json();
    if (!body.ok) setError(body.error || "failed");
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

  async function onScreenClick(e: React.MouseEvent<HTMLImageElement>) {
    if (!human || !session) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 1280);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 800);
    await call("action", { actor: "human", action: { type: "click", x, y } });
  }

  async function typeAsHuman() {
    if (!human || !typeBuf.trim()) return;
    await call("action", { actor: "human", action: { type: "type", text: typeBuf } });
    setTypeBuf("");
  }

  const steps = (session?.events ?? []).filter((ev) => ev.actor === "agent").slice(0, 6);

  return (
    <div className={`flex min-h-0 flex-col ${variant === "page" ? "min-h-[70vh]" : "h-full"}`}>
      <div className="flex items-center gap-2 border-b border-[rgba(180,180,255,0.08)] px-3 py-2.5">
        <Monitor size={14} className="text-[var(--claw-accent)]" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-[11px] text-[rgba(220,220,255,0.55)]">
            {session?.url || "about:blank"}
          </p>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 font-mono text-[10px] tracking-wide ${
            human
              ? "bg-[rgba(214,181,109,0.15)] text-[#d6b56d]"
              : agent
                ? "bg-[rgba(143,191,163,0.15)] text-[#8fbfa3]"
                : "text-[rgba(220,220,255,0.35)]"
          }`}
        >
          {human ? "YOU" : agent ? "CLAW" : "IDLE"}
        </span>
        <button
          type="button"
          className="rounded-lg border border-[rgba(180,180,255,0.15)] px-2 py-1 text-[11px] text-[rgba(220,220,255,0.55)] hover:text-[rgba(220,220,255,0.85)]"
          onClick={() => call(human ? "resume" : "takeover")}
        >
          {human ? <Play size={11} className="inline" /> : <Pause size={11} className="inline" />}{" "}
          {human ? "Return" : "Take over"}
        </button>
        <button
          type="button"
          className="grid h-8 w-8 place-items-center rounded-lg text-[rgba(220,220,255,0.4)] hover:text-[rgba(220,220,255,0.85)]"
          onClick={() => call("reset")}
          aria-label="Restart computer"
        >
          <RotateCcw size={13} />
        </button>
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

      <div className="relative min-h-0 flex-1 bg-black">
        {booting && (
          <div className="absolute inset-0 grid place-items-center text-[rgba(220,220,255,0.4)]">
            <Loader2 className="size-5 animate-spin" />
          </div>
        )}
        {session?.screenshotJpeg ? (
          <div className="relative h-full">
            <img
              alt={session.title || "Computer"}
              src={`data:image/jpeg;base64,${session.screenshotJpeg}`}
              className={`h-full w-full object-contain object-top ${human ? "cursor-crosshair" : ""}`}
              onClick={onScreenClick}
            />
            {session.pointer && (
              <span
                className="pointer-events-none absolute size-3 rounded-full border-2 border-[var(--claw-accent)] bg-[var(--claw-accent)]/40"
                style={{
                  left: `${(session.pointer.x / 1280) * 100}%`,
                  top: `${(session.pointer.y / 800) * 100}%`,
                  transform: "translate(-50%, -50%)",
                }}
              />
            )}
          </div>
        ) : (
          !booting && (
            <p className="p-6 text-[12px] text-[rgba(220,220,255,0.35)]">
              Screen appears when Chromium boots. If this stays empty, Playwright is not in this runtime — Steel scrape still works.
            </p>
          )
        )}
        {human && session?.handoffReason && (
          <div className="absolute inset-x-3 top-3 rounded-lg border border-[rgba(214,181,109,0.4)] bg-[rgba(8,8,20,0.9)] px-3 py-2 text-[12px] text-[#d6b56d]">
            Claw paused: {session.handoffReason}. Click the screen, then return control.
          </div>
        )}
        {agent && (
          <div className="absolute inset-x-3 top-3 rounded-lg border border-[rgba(143,191,163,0.3)] bg-[rgba(8,8,20,0.88)] px-3 py-1.5 text-[11px] text-[#8fbfa3]">
            Claw is using the computer
            {session?.lastAction ? ` · ${session.lastAction}` : ""}
          </div>
        )}
      </div>

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
