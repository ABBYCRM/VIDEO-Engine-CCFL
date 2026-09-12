"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Network, Plus, Square, X } from "lucide-react";

type Brief = {
  label?: string;
  context?: string;
  tools?: string[];
  successCriteria?: string[];
  ephemeral?: boolean;
  preset?: string | null;
  runner?: string;
};
type Task = {
  id: string;
  role: string;
  objective: string;
  dependsOn: string[];
  state: string;
  result: string | null;
  error: string | null;
  brief?: Brief | null;
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
  const [goal, setGoal] = useState("Find two current sources on SQLite vs managed Postgres for a single-node agent host.");
  const [context, setContext] = useState("We already run Chromium on the same DigitalOcean app.");
  const [criteria, setCriteria] = useState("Named URLs\nUnknowns labeled");
  const [preset, setPreset] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [live, setLive] = useState(false);
  const [note, setNote] = useState("Bitdeer Mistral + GLM");
  const [steer, setSteer] = useState("");

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
            if (!prev || prev.id !== newer.id || prev.status !== newer.status || prev.tasks?.length !== newer.tasks?.length) return newer;
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

  async function spawn() {
    const text = goal.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      const body = await call("spawn", {
        runId: run?.id,
        goal: text,
        context,
        successCriteria: criteria,
        preset: preset || undefined,
        tools: ["search", "fetch"],
        label: "ad-hoc",
      });
      if (!body.ok) throw new Error(body.error || "spawn failed");
      setRun(body.run);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Spawn failed");
    } finally {
      setBusy(false);
    }
  }

  async function launchPrefab() {
    const text = goal.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      const body = await call("create", { objective: text, maxAgents: 4 });
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

  async function stopTask(taskId: string) {
    if (!run?.id) return;
    const body = await call("stop", { runId: run.id, taskId });
    if (body.run) setRun(body.run);
  }

  async function messageTask(taskId: string) {
    if (!run?.id || !steer.trim()) return;
    const body = await call("message", { runId: run.id, taskId, body: steer.trim() });
    if (body.run) setRun(body.run);
    setSteer("");
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
          Spawn an ephemeral worker with a goal. No prefab agent picker. Computer and Forge keep their own Chrome.
          {drivenByClaw ? " Claw can spawn from chat too." : ""}
        </p>
        <label className="mt-3 block text-xs text-muted-foreground">Goal</label>
        <textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          rows={4}
          maxLength={2000}
          className="mt-1 w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm dark:border-[rgba(180,180,255,0.12)] dark:bg-[rgba(255,255,255,0.04)]"
        />
        <label className="mt-2 block text-xs text-muted-foreground">Context</label>
        <textarea
          value={context}
          onChange={(e) => setContext(e.target.value)}
          rows={2}
          maxLength={2000}
          className="mt-1 w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm dark:border-[rgba(180,180,255,0.12)] dark:bg-[rgba(255,255,255,0.04)]"
        />
        <label className="mt-2 block text-xs text-muted-foreground">Success criteria</label>
        <textarea
          value={criteria}
          onChange={(e) => setCriteria(e.target.value)}
          rows={2}
          className="mt-1 w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm dark:border-[rgba(180,180,255,0.12)] dark:bg-[rgba(255,255,255,0.04)]"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Optional preset
            <select
              value={preset}
              onChange={(e) => setPreset(e.target.value)}
              className="h-11 rounded-xl border border-border bg-background px-3 text-sm"
            >
              <option value="">None (ad-hoc worker)</option>
              <option value="researcher">researcher</option>
              <option value="critic">critic</option>
              <option value="synthesizer">synthesizer</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => void spawn()}
            disabled={busy || !live}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-foreground px-4 text-sm font-medium text-background disabled:opacity-40"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Spawn worker
          </button>
          <button
            type="button"
            onClick={() => void launchPrefab()}
            disabled={busy || !live}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm"
          >
            Run swarm
          </button>
          {active && (
            <button type="button" onClick={() => void cancel()} className="inline-flex h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm">
              <Square size={12} />
              Cancel run
            </button>
          )}
        </div>
        {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}
        {!live && <p className="mt-3 text-sm text-amber-400">{note}</p>}
        <ul className="mt-4 space-y-2">
          {(run?.tasks ?? []).map((task) => (
            <li key={task.id} className="rounded-xl border border-border px-3 py-2 dark:border-[rgba(180,180,255,0.10)]">
              <div className="flex justify-between gap-2 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
                <span>
                  {task.brief?.label || task.role} · {task.id}
                </span>
                <span className={tone(task.state)}>{task.state}</span>
              </div>
              <p className="mt-1 text-sm">{task.objective}</p>
              {task.brief?.successCriteria?.length ? (
                <p className="mt-1 text-[11px] text-muted-foreground">criteria: {task.brief.successCriteria.join("; ")}</p>
              ) : null}
              {task.error && <p className="mt-1 text-xs text-rose-400">{task.error}</p>}
              {task.result && (
                <p className="mt-2 max-h-36 overflow-y-auto whitespace-pre-wrap text-xs text-muted-foreground">{task.result}</p>
              )}
              {["ready", "leased", "running"].includes(task.state) && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" className="rounded-lg border border-border px-2 py-1 text-[11px]" onClick={() => void stopTask(task.id)}>
                    Stop
                  </button>
                  <button type="button" className="rounded-lg border border-border px-2 py-1 text-[11px]" onClick={() => void messageTask(task.id)}>
                    Steer
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
        {run && (
          <div className="mt-3">
            <label className="block text-xs text-muted-foreground">Steer a running worker</label>
            <input
              value={steer}
              onChange={(e) => setSteer(e.target.value)}
              className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
              placeholder="Follow-up for the selected worker"
            />
          </div>
        )}
      </section>
      <aside className="rounded-2xl border border-border bg-background p-4 dark:border-[rgba(180,180,255,0.12)] dark:bg-[rgba(5,5,15,0.55)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Parent / leader</p>
            <p className="text-xs text-muted-foreground">{note}</p>
          </div>
          {run && <span className={`font-mono text-[11px] ${tone(run.status)}`}>{run.status}</span>}
        </div>
        {run?.leaderAnswer ? (
          <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed">{run.leaderAnswer}</p>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            {active ? "Workers report here. Spawn another in parallel anytime." : "Spawn a worker. Results land on each card, then here if a leader is asked."}
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
