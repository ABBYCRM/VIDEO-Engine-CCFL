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
    <span className="font-mono text-[11px] tabular-nums text-neutral-400">
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

      <div className="flex items-center gap-2 py-1">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-neutral-100 dark:bg-neutral-800">
          <ClawLogo size={12} />
        </div>
        <span className="min-w-0 truncate text-[12px] font-medium text-neutral-500">
          {headline}
        </span>
        {busy ? (
          <>
            <PixelDotsLoader />
            <ElapsedTimer running />
          </>
        ) : isDone ? (
          <Check size={12} className="text-emerald-500" />
        ) : null}
      </div>

      {hasTools && (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {tools.filter((t) => t.name !== "status").map((tool) => (
            <span
              key={tool.id}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]",
                tool.status === "running" && "border-neutral-300 text-neutral-700 dark:border-neutral-700 dark:text-neutral-200",
                tool.status === "success" && "border-emerald-200 text-emerald-600 dark:border-emerald-900 dark:text-emerald-400",
                tool.status === "error" && "border-rose-200 text-rose-600 dark:border-rose-900 dark:text-rose-400",
                tool.status === "pending" && "border-neutral-200 text-neutral-400 dark:border-neutral-800"
              )}
            >
              {tool.status === "running" ? <Loader2 size={10} className="animate-spin" /> : null}
              {chipLabel(tool)}
            </span>
          ))}
        </div>
      )}

      {visibleStream && (
        <div className="mt-2 max-w-[90%] text-[15px] leading-relaxed text-neutral-800 dark:text-neutral-200">
          <p className="whitespace-pre-wrap break-words">
            {visibleStream}
            <span className="ml-0.5 inline-block h-3.5 w-[2px] translate-y-0.5 animate-pulse bg-current" />
          </p>
        </div>
      )}
    </div>
  );
}
