"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Network, Square, X } from "lucide-react";

type Task = {
  id: string;
  role: string;
  objective: string;
  dependsOn: string[];
  state: string;
  result: string | null;
  error: string | null;
};
type Event = { id: string; type: string; at: number; taskId: string | null };
type Run = {
  id: string;
  objective: string;
  status: string;
  leaderAnswer: string | null;
  error: string | null;
  providerNote: string;
  usage: { promptTokens: number; completionTokens: number; calls: number };
  limits: { maxAgents: number };
  tasks: Task[];
  events: Event[];
};

const STARTERS = [
  {
    label: "SQLite vs Postgres",
    prompt:
      "Compare SQLite vs managed Postgres for a single-node DigitalOcean agent orchestrator that already runs Chromium. Recommend one for MVP and name the scale-up trigger.",
  },
  {
    label: "Four vs sixteen agents",
    prompt:
      "Why does raising a research swarm from 4 to 16 agents increase tokens and latency? Give a practical default for a PI case-research desk.",
  },
  {
    label: "Bitdeer routing",
    prompt:
      "Propose a provider map for planner, researcher, critic, and synthesizer using Bitdeer-hosted Mistral Large 3 675B and GLM-5. Do not invent prices.",
  },
];

function tone(status: string) {
  if (status === "completed") return "text-emerald-400";
  if (status === "failed") return "text-rose-400";
  if (status === "cancelled" || status === "cancelling") return "text-amber-400";
  return "text-muted-foreground";
}

export function SwarmConsole({
  variant = "page",
  drivenByClaw = true,
  onClose,
}: {
  variant?: "page" | "pane";
  drivenByClaw?: boolean;
  onClose?: () => void;
}) {
  const [objective, setObjective] = useState(STARTERS[0].prompt);
  const [maxAgents, setMaxAgents] = useState(4);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [live, setLive] = useState(false);
  const [note, setNote] = useState("Bitdeer Mistral + GLM");

  const active = run && !["completed", "failed", "cancelled"].includes(run.status);

  async function call(op: string, extra: Record<string, unknown> = {}) {
    const res = await fetch("/api/swarm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op, ...extra }),
    });
    return res.json();
  }

  useEffect(() => {
    let alive = true;
    call("status")
      .then((s) => {
        if (!alive) return;
        setLive(Boolean(s.live));
        setNote(s.gateway?.note || s.note || note);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "status failed"));
    const poll = setInterval(() => {
      call("list")
        .then((body) => {
          if (!alive || !Array.isArray(body.runs) || !body.runs[0]) return;
          setRun((prev) => {
            const newer = body.runs[0];
            if (!prev || prev.id !== newer.id || prev.status !== newer.status) return newer;
            return prev;
          });
        })
        .catch(() => undefined);
    }, 2200);
    return () => {
      alive = false;
      clearInterval(poll);
    };
  }, []);

  useEffect(() => {
    if (!run?.id || !active) return;
    let alive = true;
    const t = setInterval(() => {
      fetch(`/api/swarm?id=${encodeURIComponent(run.id)}`)
        .then((r) => r.json())
        .then((body) => {
          if (!alive || !body.run) return;
          setRun(body.run);
        })
        .catch(() => undefined);
    }, 1400);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [run?.id, active]);

  const events = useMemo(() => (run?.events ?? []).slice(-12).reverse(), [run]);

  async function launch() {
    const text = objective.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      const body = await call("create", { objective: text, maxAgents });
      if (!body.ok) throw new Error(body.error || "create failed");
      setRun(body.run);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Run failed");
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!run?.id) return;
    const body = await call("cancel", { id: run.id });
    if (body.run) setRun(body.run);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-2xl border border-border bg-background p-4 dark:border-[rgba(180,180,255,0.12)] dark:bg-[rgba(5,5,15,0.55)]">
        <h1 className="flex items-center gap-2 text-base font-semibold">
          <Network size={16} />
          Claw Swarm
          {variant === "pane" && onClose && (
            <button type="button" className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-muted-foreground" onClick={onClose} aria-label="Close swarm">
              <X size={14} />
            </button>
          )}
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {drivenByClaw
            ? "Claw builds planner, workers, and a leader from chat. You watch this graph."
            : "Planner decomposes the objective. Workers run in parallel. Leader synthesizes. Computer and Forge keep their own Chrome."}
        </p>
        {drivenByClaw ? (
          active ? (
            <button type="button" onClick={() => void cancel()} className="mt-3 inline-flex h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm">
              <Square size={12} />
              Cancel
            </button>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">Ask Claw in chat. The task graph appears when Claw tasks Swarm.</p>
          )
        ) : (
        <>
        <textarea
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          rows={6}
          maxLength={2000}
          className="mt-3 w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm dark:border-[rgba(180,180,255,0.12)] dark:bg-[rgba(255,255,255,0.04)]"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Agents
            <select
              value={maxAgents}
              onChange={(e) => setMaxAgents(Number(e.target.value))}
              className="h-11 rounded-xl border border-border bg-background px-3 text-sm"
            >
              <option value={2}>2</option>
              <option value={3}>3</option>
              <option value={4}>4</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => void launch()}
            disabled={busy || !live}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-foreground px-4 text-sm font-medium text-background disabled:opacity-40"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Network size={14} />}
            Run swarm
          </button>
          {active && (
            <button
              type="button"
              onClick={() => void cancel()}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm"
            >
              <Square size={12} />
              Cancel
            </button>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {STARTERS.map((s) => (
            <button
              key={s.label}
              type="button"
              className="rounded-full border border-border px-3 py-1.5 text-[12px] text-muted-foreground"
              onClick={() => setObjective(s.prompt)}
            >
              {s.label}
            </button>
          ))}
        </div>
        {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}
        {!live && <p className="mt-3 text-sm text-amber-400">{note}</p>}
        </>
        )}
        <ul className="mt-4 space-y-2">
          {(run?.tasks ?? []).map((task) => (
            <li key={task.id} className="rounded-xl border border-border px-3 py-2 dark:border-[rgba(180,180,255,0.10)]">
              <div className="flex justify-between gap-2 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
                <span>
                  {task.role} · {task.id}
                </span>
                <span className={tone(task.state)}>{task.state}</span>
              </div>
              <p className="mt-1 text-sm">{task.objective}</p>
              {task.error && <p className="mt-1 text-xs text-rose-400">{task.error}</p>}
              {task.result && (
                <p className="mt-2 max-h-36 overflow-y-auto whitespace-pre-wrap text-xs text-muted-foreground">{task.result}</p>
              )}
            </li>
          ))}
        </ul>
      </section>
      <aside className="rounded-2xl border border-border bg-background p-4 dark:border-[rgba(180,180,255,0.12)] dark:bg-[rgba(5,5,15,0.55)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Leader</p>
            <p className="text-xs text-muted-foreground">{note}</p>
          </div>
          {run && <span className={`font-mono text-[11px] ${tone(run.status)}`}>{run.status}</span>}
        </div>
        {run?.leaderAnswer ? (
          <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed">{run.leaderAnswer}</p>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            {active ? "Workers are running. The leader answers after the graph completes." : "The synthesizer answer lands here."}
          </p>
        )}
        {run?.error && <p className="mt-3 text-sm text-rose-400">{run.error}</p>}
        {run && (
          <p className="mt-4 font-mono text-[11px] text-muted-foreground">
            {run.usage.calls} calls · {run.usage.promptTokens + run.usage.completionTokens} tokens · max {run.limits.maxAgents} agents
          </p>
        )}
        <p className="mb-2 mt-6 text-xs uppercase tracking-wider text-muted-foreground">Events</p>
        <ul className="space-y-1">
          {events.map((evt) => (
            <li key={evt.id} className="font-mono text-[11px] text-muted-foreground">
              {new Date(evt.at).toLocaleTimeString()} {evt.type}
              {evt.taskId ? ` · ${evt.taskId}` : ""}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
