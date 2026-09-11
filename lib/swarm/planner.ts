import { defaultPlan, parsePlannerOutput, SWARM_MAX_TOKENS } from "./policy";
import type { ModelGateway, PlannedTask, SwarmLimits } from "./types";

const PLANNER_SYSTEM = `You are the Claw Swarm planner. Convert the operator objective into a small DAG of bounded tasks.

Return ONLY JSON:
{"tasks":[{"id":"research-a","role":"researcher","objective":"...","depends_on":[],"urls":[]},{"id":"research-b","role":"researcher","objective":"...","depends_on":[],"urls":[]},{"id":"critic","role":"critic","objective":"...","depends_on":["research-a","research-b"]},{"id":"synth","role":"synthesizer","objective":"...","depends_on":["critic"]}]}

Rules:
- Roles allowed: researcher, critic, synthesizer.
- At most MAX_AGENTS tasks. Depth at most 2. Always include exactly one synthesizer as the leader.
- Researchers may list up to 2 public http(s) URLs to fetch. Never private/localhost/metadata URLs.
- Do not spawn recursive children. Do not include chain-of-thought. Do not click CAPTCHAs or ask for Computer control.
- Tasks exchange findings, not hidden reasoning.`;

export async function planTasks(opts: {
  objective: string;
  limits: SwarmLimits;
  gateway: ModelGateway;
  signal?: AbortSignal;
}): Promise<{ tasks: PlannedTask[]; via: "planner" | "fallback"; raw?: string; error?: string }> {
  const fallback = defaultPlan(opts.objective, opts.limits.maxAgents);
  if (!opts.gateway.available) return { tasks: fallback, via: "fallback", error: opts.gateway.note };
  try {
    const result = await opts.gateway.complete({
      role: "planner",
      jsonMode: true,
      maxTokens: SWARM_MAX_TOKENS.planner,
      signal: opts.signal,
      messages: [
        { role: "system", content: PLANNER_SYSTEM.replace("MAX_AGENTS", String(opts.limits.maxAgents)) },
        {
          role: "user",
          content: `MAX_AGENTS=${opts.limits.maxAgents}\nMAX_DEPTH=${opts.limits.maxDepth}\nOBJECTIVE:\n${opts.objective}`,
        },
      ],
    });
    const tasks = parsePlannerOutput(result.text, opts.limits);
    return { tasks, via: "planner", raw: result.text.slice(0, 2000) };
  } catch (e) {
    return {
      tasks: fallback,
      via: "fallback",
      error: e instanceof Error ? e.message : "planner failed",
    };
  }
}
