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
    running: "border-[hsl(var(--claw-accent))]/30",
    success: "border-emerald-500/30",
    error: "border-rose-500/30",
    pending: "border-border",
  }[tool.status];

  return (
    <div
      className={cn(
        "rounded-xl border bg-[hsl(var(--claw-elevated))] text-xs transition-all",
        borderColor,
        !open && hasContent && "cursor-pointer hover:bg-[hsl(var(--claw-elevated))]/80"
      )}
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
        onClick={() => hasContent && setOpen((o) => !o)}
        aria-expanded={open}
      >
        {hasContent ? (
          <ChevronRight
            size={12}
            className={cn(
              "shrink-0 text-muted-foreground transition-transform",
              open && "rotate-90"
            )}
          />
        ) : (
          <span className="shrink-0" />
        )}

        {statusIcon}

        <span className={cn(
          "flex-1 truncate font-semibold",
          tool.status === "running" && "text-foreground",
          tool.status === "success" && "text-emerald-600 dark:text-emerald-400",
          tool.status === "error" && "text-rose-600 dark:text-rose-400",
          tool.status === "pending" && "text-muted-foreground"
        )}>
          {tool.name}
        </span>

        {tool.via && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            via {tool.via}
          </span>
        )}

        {tool.finishedAt && tool.startedAt && (
          <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
            {tool.finishedAt - tool.startedAt}ms
          </span>
        )}
      </button>

      {open && hasContent && (
        <div className="border-t border-border/50">
          {tool.args && (
            <div className="px-3 py-2">
              <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Terminal size={10} /> Input
              </div>
              <pre className="overflow-x-auto rounded-lg bg-black/40 p-2 font-mono text-[11px] leading-relaxed text-green-400 whitespace-pre-wrap break-all">
                {tool.args.length > 400 ? tool.args.slice(0, 400) + "…" : tool.args}
              </pre>
            </div>
          )}
          {tool.result && (
            <div className="px-3 pb-2">
              <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Wrench size={10} /> Output
              </div>
              <pre className="overflow-x-auto rounded-lg bg-black/40 p-2 font-mono text-[11px] leading-relaxed text-blue-300 whitespace-pre-wrap break-all max-h-40">
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
  // Show the last ~200 chars of streaming text
  const preview = text.length > 200 ? "…" + text.slice(-200) : text;
  if (!preview) return null;
  return (
    <div className="mt-2 rounded-xl border border-border bg-[hsl(var(--claw-elevated))] px-3 py-2">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--claw-accent))] animate-pulse" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Responding</span>
      </div>
      <p className="whitespace-pre-wrap break-words font-mono text-[11.5px] leading-relaxed text-foreground/80">
        {preview}
        <span className="ml-0.5 inline-block h-3.5 w-[2px] translate-y-0.5 animate-pulse bg-[hsl(var(--claw-accent))]" />
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
    <span className="tabular-nums text-[11px] text-muted-foreground">
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
      <div className="ml-8 flex items-center gap-2 py-1">
        <ClawLogo size={16} className="shrink-0" />
        <span className="text-xs font-medium text-muted-foreground">
          {isDone ? "Claw worked" : busy ? "Claw is working" : ""}
        </span>
        {busy ? (
          <>
            <PixelDotsLoader />
            <ElapsedTimer running />
          </>
        ) : isDone ? (
          <>
            <Check size={12} className="text-emerald-500" />
            {tools.length > 0 && (
              <span className="text-[11px] text-muted-foreground">
                {tools.filter(t => t.status === "success").length}/{tools.length} tools
              </span>
            )}
          </>
        ) : null}
      </div>

      {/* Tool executions */}
      {hasTools && (
        <div className="ml-8 flex flex-col gap-1.5">
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
