"use client";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ClawLogo } from "@/components/claw-logo";
import { Check, Loader2 } from "lucide-react";
import { humanToolProgress, looksLikeInternalState, sanitizeUserVisibleMessage } from "@/lib/claw/user-visible";

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

export type ToolNode = {
  id: string;
  name: string;
  label?: string;
  args?: string;
  result?: string;
  status: "running" | "success" | "error" | "pending";
  via?: string;
  startedAt?: number;
  finishedAt?: number;
};

export type SelfStateView = {
  health?: string;
  issue?: string;
  phase?: string;
  progress?: number;
  strategy?: string;
  blockers?: string[];
  step?: string;
  toolsRun?: number;
};

type ClawThinkingPanelProps = {
  tools: ToolNode[];
  streaming?: string;
  busy: boolean;
  selfState?: SelfStateView | null;
  className?: string;
};

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
    }
    if (startRef.current) {
      setElapsed(Math.round((Date.now() - startRef.current) / 1000));
    }
  }, [running]);

  return (
    <span className="tabular-nums font-mono text-[11px] text-[rgba(220,220,255,0.30)]">
      {elapsed}s
    </span>
  );
}

function chipLabel(tool: ToolNode): string {
  return tool.label || humanToolProgress(tool.name);
}

export function ClawThinkingPanel({ tools, streaming, busy, className }: ClawThinkingPanelProps) {
  const hasTools = tools.length > 0;
  const isDone = !busy && tools.length > 0;
  const running = tools.find((t) => t.status === "running");
  const headline = running
    ? chipLabel(running)
    : busy
      ? "Working…"
      : isDone
        ? "Done"
        : "";
  const visibleStream = streaming && !looksLikeInternalState(streaming)
    ? sanitizeUserVisibleMessage(streaming)
    : "";

  return (
    <div className={cn("animate-fade-up", className)}>
      <style>{`
        @keyframes claw-pixel-on {
          0%, 100% { opacity: 0.15; transform: scale(0.9); }
          50% { opacity: 0.95; transform: scale(1.1); }
        }
      `}</style>

      <div className="ml-9 flex items-center gap-2 py-1">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[rgba(199,100,67%,0.15)] border border-[rgba(199,100,67%,0.20)]">
          <ClawLogo size={12} className="text-[var(--claw-accent)]" />
        </div>
        <span className="min-w-0 truncate text-[12px] font-medium text-muted-foreground">
          {headline}
        </span>
        {busy ? (
          <>
            <PixelDotsLoader />
            <ElapsedTimer running />
          </>
        ) : isDone ? (
          <Check size={12} className="text-emerald-400" />
        ) : null}
      </div>

      {hasTools && (
        <div className="ml-9 mt-1 flex flex-wrap gap-1.5">
          {tools.filter((t) => t.name !== "status").map((tool) => (
            <span
              key={tool.id}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]",
                tool.status === "running" && "border-[rgba(199,100,67%,0.30)] text-[var(--claw-accent)]",
                tool.status === "success" && "border-[rgba(50,220,130,0.25)] text-emerald-400",
                tool.status === "error" && "border-[rgba(255,80,80,0.25)] text-rose-400",
                tool.status === "pending" && "border-[rgba(180,180,255,0.10)] text-muted-foreground"
              )}
            >
              {tool.status === "running" ? <Loader2 size={10} className="animate-spin" /> : null}
              {chipLabel(tool)}
            </span>
          ))}
        </div>
      )}

      {visibleStream && (
        <div className="ml-9 mt-2 rounded-xl border border-[rgba(180,180,255,0.10)] bg-[rgba(199,100,67%,0.06)] px-3 py-2.5">
          <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-foreground">
            {visibleStream}
            <span className="ml-0.5 inline-block h-3.5 w-[2px] translate-y-0.5 animate-pulse bg-[var(--claw-accent)]" />
          </p>
        </div>
      )}
    </div>
  );
}
