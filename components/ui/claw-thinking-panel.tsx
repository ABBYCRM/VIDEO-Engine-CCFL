"use client";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ClawLogo } from "@/components/claw-logo";
import {
  Check, ChevronRight, Loader2, Square, Terminal, Wrench,
  AlertCircle, Copy, CheckCheck, X, Clock
} from "lucide-react";

/* ─────────────────────────────────────────────────────────
 * PIXEL DOTS LOADER  (from 21st.dev ai-agent-response)
 * The 3×3 diagonal wave is the signature "working" indicator
 * ───────────────────────────────────────────────────────── */
const PIXEL_DELAYS = [0, 1, 2, 1, 2, 3, 2, 3, 4];

export function PixelDotsLoader({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 grid-cols-[repeat(3,3px)] gap-[1.5px] items-center",
        className
      )}
    >
      {PIXEL_DELAYS.map((delay, index) => (
        <span
          key={index}
          className="size-[3px] rounded-full bg-current opacity-80 transition-opacity motion-reduce:animate-none"
          style={{
            opacity: 0.2,
            animation: `claw-pixel-on 650ms cubic-bezier(0.23, 1, 0.32, 1) ${delay * 90}ms infinite`,
          }}
        />
      ))}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────
 * TYPES
 * ───────────────────────────────────────────────────────── */
export type ToolNode = {
  id: string;
  name: string;
  args?: string;
  result?: string;
  status: "running" | "success" | "error" | "pending";
  via?: string;
  startedAt?: number;
  finishedAt?: number;
};

type ClawThinkingPanelProps = {
  tools: ToolNode[];
  streaming?: string;
  busy: boolean;
  className?: string;
};

/* ─────────────────────────────────────────────────────────
 * SIMPLE ACCORDION
 * ───────────────────────────────────────────────────────── */
function ToolAccordion({ tool }: { tool: ToolNode }) {
  const [open, setOpen] = useState(false);
  const hasContent = tool.args || tool.result;

  const statusIcon = {
    running: <Loader2 size={12} className="animate-spin text-[hsl(var(--claw-accent))]" />,
    success: <Check size={12} className="text-emerald-500" />,
    error: <X size={12} className="text-rose-500" />,
    pending: <Clock size={12} className="text-muted-foreground/50" />,
  }[tool.status];

  const borderColor = {
    running: "border-[rgba(199,100,67%,0.30)]",
    success: "border-[rgba(50,220,130,0.25)]",
    error: "border-[rgba(255,80,80,0.25)]",
    pending: "border-[rgba(180,180,255,0.10)]",
  }[tool.status];

  return (
    <div
      className={cn(
        "rounded-xl border text-xs transition-all backdrop-blur-md",
        borderColor,
        tool.status === "running" ? "bg-[rgba(199,100,67%,0.08)]" : "bg-[rgba(255,255,255,0.04)]",
        !open && hasContent && "cursor-pointer hover:bg-[rgba(255,255,255,0.07)]"
      )}
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
        onClick={() => hasContent && setOpen((o) => !o)}
        aria-expanded={open}
      >
        {hasContent ? (
          <ChevronRight
            size={11}
            className={cn(
              "shrink-0 text-[rgba(220,220,255,0.30)] transition-transform",
              open && "rotate-90"
            )}
          />
        ) : (
          <span className="shrink-0" />
        )}

        {statusIcon}

        <span className={cn(
          "flex-1 truncate font-semibold",
          tool.status === "running" && "text-[rgba(220,220,255,0.90)]",
          tool.status === "success" && "text-emerald-400",
          tool.status === "error" && "text-rose-400",
          tool.status === "pending" && "text-[rgba(220,220,255,0.35)]"
        )}>
          {tool.name}
        </span>

        {tool.via && (
          <span className="rounded border border-[rgba(180,180,255,0.12)] bg-[rgba(255,255,255,0.06)] px-1.5 py-0.5 text-[10px] text-[rgba(220,220,255,0.40)]">
            {tool.via}
          </span>
        )}

        {tool.finishedAt && tool.startedAt && (
          <span className="font-mono text-[10px] text-[rgba(220,220,255,0.25)] tabular-nums shrink-0">
            {tool.finishedAt - tool.startedAt}ms
          </span>
        )}
      </button>

      {open && hasContent && (
        <div className="border-t border-[rgba(180,180,255,0.07)]">
          {tool.args && (
            <div className="px-3 py-2.5">
              <div className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[rgba(220,220,255,0.25)]">
                <Terminal size={10} /> Input
              </div>
              <pre className="overflow-x-auto rounded-lg border border-[rgba(180,180,255,0.08)] bg-[rgba(0,0,0,0.30)] p-2.5 font-mono text-[11px] leading-relaxed text-emerald-400/90 whitespace-pre-wrap break-all">
                {tool.args.length > 400 ? tool.args.slice(0, 400) + "…" : tool.args}
              </pre>
            </div>
          )}
          {tool.result && (
            <div className="px-3 pb-2.5">
              <div className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[rgba(220,220,255,0.25)]">
                <Wrench size={10} /> Output
              </div>
              <pre className="overflow-x-auto rounded-lg border border-[rgba(180,180,255,0.08)] bg-[rgba(0,0,0,0.30)] p-2.5 font-mono text-[11px] leading-relaxed text-cyan-400/80 whitespace-pre-wrap break-all max-h-40">
                {tool.result.length > 600 ? tool.result.slice(0, 600) + "…" : tool.result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
 * STREAMING TOKEN PREVIEW
 * ───────────────────────────────────────────────────────── */
function StreamingPreview({ text }: { text: string }) {
  const preview = text.length > 200 ? "…" + text.slice(-200) : text;
  if (!preview) return null;
  return (
    <div className="mt-2 rounded-xl border border-[rgba(180,180,255,0.10)] bg-[rgba(199,100,67%,0.06)] px-3 py-2.5 backdrop-blur-md">
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--claw-accent)] animate-pulse shadow-[0_0_6px_var(--claw-accent)]" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--claw-accent)]">Responding</span>
      </div>
      <p className="whitespace-pre-wrap break-words font-mono text-[11.5px] leading-relaxed text-[rgba(220,220,255,0.70)]">
        {preview}
        <span className="ml-0.5 inline-block h-3.5 w-[2px] translate-y-0.5 animate-pulse bg-[var(--claw-accent)]" />
      </p>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
 * ELAPSED TIMER
 * ───────────────────────────────────────────────────────── */
function ElapsedTimer({ running }: { running: boolean }) {
  const startRef = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (running) {
      startRef.current = Date.now();
      setElapsed(0);
      const id = setInterval(() => {
        setElapsed(Math.round((Date.now() - (startRef.current ?? Date.now())) / 1000));
      }, 250);
      return () => clearInterval(id);
    } else {
      // Keep showing final time
      if (startRef.current) {
        setElapsed(Math.round((Date.now() - startRef.current) / 1000));
      }
    }
  }, [running]);

  return (
    <span className="tabular-nums font-mono text-[11px] text-[rgba(220,220,255,0.30)]">
      {elapsed}s
    </span>
  );
}

/* ─────────────────────────────────────────────────────────
 * MAIN PANEL
 * ───────────────────────────────────────────────────────── */
export function ClawThinkingPanel({ tools, streaming, busy, className }: ClawThinkingPanelProps) {
  const hasTools = tools.length > 0;
  const isDone = !busy && tools.length > 0;

  return (
    <>
      <style>{`
        @keyframes claw-pixel-on {
          0%, 100% { opacity: 0.15; transform: scale(0.9); }
          50% { opacity: 0.95; transform: scale(1.1); }
        }
      `}</style>

      {/* Thinking header */}
      <div className="ml-9 flex items-center gap-2 py-1">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[rgba(199,100,67%,0.15)] border border-[rgba(199,100,67%,0.20)]">
          <ClawLogo size={12} className="text-[var(--claw-accent)]" />
        </div>
        <span className="text-[12px] font-medium text-[rgba(220,220,255,0.50)]">
          {isDone ? "Claw worked" : busy ? "Claw is working" : ""}
        </span>
        {busy ? (
          <>
            <PixelDotsLoader />
            <ElapsedTimer running />
          </>
        ) : isDone ? (
          <>
            <Check size={12} className="text-emerald-400" />
            {tools.length > 0 && (
              <span className="text-[11px] text-[rgba(220,220,255,0.35)]">
                {tools.filter(t => t.status === "success").length}/{tools.length} tools
              </span>
            )}
          </>
        ) : null}
      </div>

      {/* Tool executions */}
      {hasTools && (
        <div className="ml-9 flex flex-col gap-1.5">
          {tools.map((tool) => (
            <ToolAccordion key={tool.id} tool={tool} />
          ))}
        </div>
      )}

      {/* Live streaming token preview */}
      {streaming && (
        <StreamingPreview text={streaming} />
      )}
    </>
  );
}
