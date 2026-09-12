import { ensureSession, getActiveSession, setControlOwner } from "@/lib/browser-computer";
import {
  createForgeSession,
  navigateForge,
  probeForge,
  scrapeWithForge,
} from "@/lib/forge";
import { getSwarm, spawnEphemeralAgent, waitSwarmTask } from "@/lib/swarm";
import { scrapePublicUrl } from "@/lib/scrape";
import { runCursorControl } from "@/lib/cursor";
import type { PublicSwarmRun } from "@/lib/swarm";

export const AGENT_KINDS = ["computer", "forge", "swarm", "steel", "cursor"] as const;
export type AgentKind = (typeof AGENT_KINDS)[number];

export type DispatchInput = {
  agent: string;
  task?: string;
  work?: string;
  url?: string;
  stealth?: "off" | "coherence" | "lab";
  maxAgents?: number;
  sessionId?: string;
};

function clip(text: string, n = 3500) {
  return text.length <= n ? text : `${text.slice(0, n)}\n…[truncated]`;
}

function inferForgeWork(task: string, work?: string) {
  const explicit = String(work || "").toLowerCase().trim();
  if (explicit === "probe" || explicit === "scrape" || explicit === "session") return explicit;
  if (/fingerprint|probe|detector|webdriver/i.test(task)) return "probe";
  if (/scrape|markdown|extract/i.test(task)) return "scrape";
  return "session";
}

function publicSwarm(run: PublicSwarmRun | null) {
  if (!run) return null;
  return {
    id: run.id,
    status: run.status,
    objective: run.objective,
    leaderAnswer: run.leaderAnswer,
    error: run.error,
    usage: run.usage,
    tasks: run.tasks.map((t) => ({
      id: t.id,
      role: t.role,
      state: t.state,
      objective: t.objective,
      result: t.result ? clip(t.result, 1200) : null,
      error: t.error,
    })),
  };
}

export async function dispatchAgent(input: DispatchInput) {
  const agent = String(input.agent || "").toLowerCase().trim();
  const task = String(input.task || "").trim();
  if (!AGENT_KINDS.includes(agent as AgentKind)) {
    return {
      ok: false as const,
      error: "agent must be computer, forge, swarm, steel, or cursor. You choose. The operator does not.",
    };
  }

  if (agent === "computer") {
    let session = await ensureSession();
    if (session.controlOwner === "HUMAN" || session.status === "HANDOFF_REQUESTED") {
      return {
        ok: true as const,
        agent,
        built: true,
        tasked: false,
        handedOff: true,
        note: `Computer is waiting on the operator (${session.handoffReason ?? "manual"}). They already have the live screen. After they return control, continue with computer_*.`,
        session: {
          id: session.id,
          url: session.url,
          title: session.title,
          controlOwner: session.controlOwner,
          handoffReason: session.handoffReason,
        },
      };
    }
    if (session.controlOwner === "NONE") session = await setControlOwner("AGENT");
    const live = getActiveSession() ?? session;
    return {
      ok: true as const,
      agent,
      built: true,
      tasked: true,
      note: "Computer agent is live. YOU drive it now with computer_open / computer_look / computer_click / computer_search. Never tell the operator to open /computer or click Take over unless you called computer_handoff.",
      session: {
        id: live.id,
        url: live.url,
        title: live.title,
        controlOwner: live.controlOwner,
        handoffReason: live.handoffReason,
      },
      task: task || null,
    };
  }

  if (agent === "cursor") {
    const launched = await runCursorControl({
      op: "launch",
      prompt: task,
      repo: String(input.url || "").trim() || undefined,
    });
    return {
      ...launched,
      agent,
      built: launched.ok,
      tasked: launched.ok,
      note: launched.ok
        ? "Cursor cloud agent launched on the spot. Poll cursor_status, steer with cursor_reply, stop with cursor_cancel. Do not do the repo work inline."
        : launched.error,
    };
  }

  if (agent === "steel") {
    const url = String(input.url || "").trim() || task.match(/https?:\/\/\S+/i)?.[0] || "";
    if (!url) return { ok: false as const, agent, error: "steel dispatch needs a public url" };
    const result = await scrapePublicUrl({ url });
    return { ok: true as const, agent, built: true, tasked: true, work: "scrape", result };
  }

  if (agent === "forge") {
    const work = inferForgeWork(task, input.work);
    const url = String(input.url || "").trim();
    try {
      if (work === "probe") {
        const result = await probeForge({ sessionId: input.sessionId, url: url || undefined });
        const fp = result.probe.fingerprint;
        return {
          ok: true as const,
          agent,
          built: true,
          tasked: true,
          work,
          sessionId: result.session?.id ?? null,
          url: result.session?.url ?? null,
          title: result.session?.title ?? null,
          handoff: result.session?.handoffReason ?? null,
          probe: {
            ok: result.probe.ok,
            digest: result.probe.digest,
            score: result.probe.detector.score,
            findings: result.probe.detector.findings,
            note: result.probe.detector.note,
            webdriver: fp?.webdriver,
            userAgent: fp?.userAgent,
            hardwareConcurrency: fp?.hardwareConcurrency,
            deviceMemory: fp?.deviceMemory,
            error: result.probe.error,
          },
        };
      }
      if (work === "scrape") {
        const target = url || task.match(/https?:\/\/\S+/i)?.[0] || "";
        if (!target) return { ok: false as const, agent, error: "forge scrape needs a public url" };
        const result = await scrapeWithForge({ url: target, sessionId: input.sessionId, screenshot: true });
        return {
          ok: result.scrape.ok,
          agent,
          built: true,
          tasked: true,
          work,
          sessionId: result.session?.id ?? null,
          url: result.session?.url ?? result.scrape.url,
          title: result.scrape.title,
          handoff: result.session?.handoffReason ?? null,
          scrape: {
            ok: result.scrape.ok,
            title: result.scrape.title,
            markdown: clip(result.scrape.markdown || ""),
            links: (result.scrape.links || []).slice(0, 12),
            error: result.scrape.error,
          },
        };
      }
      const session = await createForgeSession({ stealth: input.stealth ?? "coherence", persist: true });
      const opened = url ? await navigateForge(session.id, url) : session;
      return {
        ok: true as const,
        agent,
        built: true,
        tasked: true,
        work,
        sessionId: opened.id,
        url: opened.url,
        title: opened.title,
        stealth: opened.stealth,
        cookies: opened.cookieCount,
        cdp: opened.cdpHttp,
        note: "Forge session is built. Follow with claw_dispatch work=probe or work=scrape if needed. Do not tell the operator to click New session.",
      };
    } catch (e) {
      return { ok: false as const, agent, error: e instanceof Error ? e.message : "forge dispatch failed" };
    }
  }

  const spawned = spawnEphemeralAgent({
    goal: task || "Research the operator's question and report evidence back.",
    label: "dispatch",
    tools: ["search", "fetch"],
  });
  if (!spawned.ok) return { ok: false as const, agent, error: spawned.error };
  const waited = await waitSwarmTask({ runId: spawned.run.id, taskId: spawned.taskId, timeoutMs: 40_000 });
  const finished = waited.ok ? waited.run : getSwarm(spawned.run.id);
  const worker = waited.ok ? waited.task : spawned.run.tasks.find((t) => t.id === spawned.taskId);
  return {
    ok: true as const,
    agent,
    built: true,
    tasked: true,
    work: "spawn",
    note: worker && ["completed", "failed", "cancelled"].includes(worker.state)
      ? "Ephemeral worker finished. Result is on the task, not a prefab planner graph. Spawn more in parallel with swarm_spawn if needed."
      : "Worker is still running. Poll swarm_status or swarm_wait. Do not tell the operator to click Run swarm.",
    run: publicSwarm(finished ?? spawned.run),
    taskId: spawned.taskId,
    brief: spawned.brief,
  };
}
