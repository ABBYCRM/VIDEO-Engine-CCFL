import { fetchPublicPage } from "./fetch-tool";
import { SWARM_MAX_TASK_RESULT, SWARM_MAX_TOKENS } from "./policy";
import type { ModelGateway, SwarmTask } from "./types";

function clip(text: string, max = SWARM_MAX_TASK_RESULT) {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n…[truncated]`;
}

export async function runWorker(opts: {
  task: SwarmTask;
  upstream: string;
  gateway: ModelGateway;
  remainingFetches: number;
  signal?: AbortSignal;
}): Promise<{ text: string; evidence: string[]; fetchesUsed: number; model: string; provider: string; usage: { promptTokens: number; completionTokens: number } }> {
  const evidence: string[] = [];
  let fetchesUsed = 0;
  const urls = opts.task.urls.slice(0, Math.max(0, opts.remainingFetches));
  for (const url of urls) {
    const page = await fetchPublicPage(url, opts.signal);
    fetchesUsed += 1;
    evidence.push(
      page.ok
        ? `FETCH ${page.url}\nTITLE ${page.title}\n${page.text}`
        : `FETCH FAILED ${page.url}: ${page.error}`,
    );
  }

  const rolePrompt =
    opts.task.role === "researcher"
      ? "You are a researcher subagent. Return structured findings: claims, evidence, unknowns, and confidence. Do not produce the final answer. Do not include hidden chain-of-thought."
      : opts.task.role === "critic"
        ? "You are a critic subagent. Attack weak claims, find contradictions, and list what is still unknown. Do not produce the final answer."
        : "You are the designated leader. Synthesize a final operator-facing answer from the task outputs only. Be concise and decisive. Do not reveal hidden chain-of-thought. If evidence is thin, say so.";

  const result = await opts.gateway.complete({
    role: opts.task.role,
    maxTokens: SWARM_MAX_TOKENS[opts.task.role],
    signal: opts.signal,
    messages: [
      { role: "system", content: rolePrompt },
      {
        role: "user",
        content: [
          `TASK_ID: ${opts.task.id}`,
          `OBJECTIVE: ${opts.task.objective}`,
          opts.upstream ? `UPSTREAM_FINDINGS:\n${opts.upstream}` : "UPSTREAM_FINDINGS: (none)",
          evidence.length ? `FETCHED_EVIDENCE:\n${evidence.join("\n---\n")}` : "FETCHED_EVIDENCE: (none)",
          "Return only the task output the leader is allowed to see.",
        ].join("\n\n"),
      },
    ],
  });

  return {
    text: clip(result.text.trim() || "(empty worker output)"),
    evidence: evidence.map((e) => clip(e, 1800)),
    fetchesUsed,
    model: result.model,
    provider: result.provider,
    usage: result.usage,
  };
}

export function collectUpstream(task: SwarmTask, siblings: SwarmTask[]): string {
  const byId = new Map(siblings.map((t) => [t.id, t]));
  const parts: string[] = [];
  for (const id of task.dependsOn) {
    const src = byId.get(id);
    if (!src?.result) continue;
    parts.push(`## ${src.role} / ${src.id}\n${src.result}`);
  }
  return clip(parts.join("\n\n"), 10_000);
}
