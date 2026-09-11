import { fetchPublicPage } from "./fetch-tool";
import { SWARM_MAX_TASK_RESULT, SWARM_MAX_TOKENS } from "./policy";
import type { ModelGateway, SwarmTask } from "./types";

const SESSION_ROUNDS = 3;

function clip(text: string, max = SWARM_MAX_TASK_RESULT) {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n…[truncated]`;
}

type SessionAction =
  | { action: "search"; query: string }
  | { action: "fetch"; url: string }
  | { action: "done"; output: string };

function parseAction(text: string): SessionAction {
  const trimmed = text.trim();
  try {
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const raw = fence ? fence[1] : trimmed;
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) return { action: "done", output: trimmed };
    const parsed = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
    const action = String(parsed.action || parsed.type || "").toLowerCase();
    if (action === "search" && String(parsed.query || "").trim()) {
      return { action: "search", query: String(parsed.query).trim().slice(0, 300) };
    }
    if (action === "fetch" && String(parsed.url || "").trim()) {
      return { action: "fetch", url: String(parsed.url).trim() };
    }
    if (action === "done" || parsed.output) {
      return { action: "done", output: String(parsed.output || parsed.summary || parsed.text || trimmed) };
    }
  } catch {
    /* prose answer */
  }
  return { action: "done", output: trimmed };
}

async function searchWeb(query: string): Promise<string> {
  try {
    const mod = await import("@/lib/web-search");
    if (!mod.isExaConfigured() && !mod.isTavilyConfigured()) {
      return "SEARCH skipped: no Exa/Tavily key. Continue with known URLs only.";
    }
    const found = await mod.webSearch({ query, numResults: 5 });
    if (!found.results.length) return `SEARCH empty via ${found.via}`;
    return found.results
      .slice(0, 5)
      .map((r) => `${r.title || "(untitled)"}\n${r.url}\n${r.snippet || ""}`)
      .join("\n---\n");
  } catch (e) {
    return `SEARCH failed: ${e instanceof Error ? e.message : "unknown"}`;
  }
}

export async function runWorker(opts: {
  task: SwarmTask;
  upstream: string;
  gateway: ModelGateway;
  remainingFetches: number;
  signal?: AbortSignal;
}): Promise<{
  text: string;
  evidence: string[];
  fetchesUsed: number;
  model: string;
  provider: string;
  usage: { promptTokens: number; completionTokens: number };
}> {
  const evidence: string[] = [];
  let fetchesUsed = 0;
  let searchesUsed = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let lastModel = "";
  let lastProvider = opts.gateway.name;

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

  const looping = opts.task.role === "researcher" || opts.task.role === "critic";
  const rolePrompt =
    opts.task.role === "researcher"
      ? "You are an independent researcher session. You may search or fetch, then return structured findings: claims, evidence, unknowns, confidence. No hidden chain-of-thought."
      : opts.task.role === "critic"
        ? "You are an independent critic session. Attack weak claims and contradictions. You may fetch a source to verify. Do not produce the final operator answer."
        : "You are the designated leader. Synthesize a final operator-facing answer from the task outputs only. Be concise and decisive. Do not reveal hidden chain-of-thought. If evidence is thin, say so.";

  const history: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    {
      role: "system",
      content: looping
        ? `${rolePrompt}

You have a small tool loop. Reply with ONLY JSON:
{"action":"search","query":"..."} OR {"action":"fetch","url":"https://..."} OR {"action":"done","output":"..."}.
At most ${SESSION_ROUNDS} tool rounds. When finished, action=done with the task output the leader is allowed to see.`
        : rolePrompt,
    },
    {
      role: "user",
      content: [
        `TASK_ID: ${opts.task.id}`,
        `OBJECTIVE: ${opts.task.objective}`,
        opts.upstream ? `UPSTREAM_FINDINGS:\n${opts.upstream}` : "UPSTREAM_FINDINGS: (none)",
        evidence.length ? `FETCHED_EVIDENCE:\n${evidence.join("\n---\n")}` : "FETCHED_EVIDENCE: (none)",
        looping ? "Choose search, fetch, or done." : "Return only the task output the leader is allowed to see.",
      ].join("\n\n"),
    },
  ];

  const maxRounds = looping ? SESSION_ROUNDS : 0;
  let finalText = "";

  for (let round = 0; round <= maxRounds; round++) {
    const result = await opts.gateway.complete({
      role: opts.task.role,
      maxTokens: SWARM_MAX_TOKENS[opts.task.role],
      jsonMode: looping && round < maxRounds,
      signal: opts.signal,
      messages: history,
    });
    lastModel = result.model;
    lastProvider = result.provider;
    promptTokens += result.usage.promptTokens;
    completionTokens += result.usage.completionTokens;

    if (!looping) {
      finalText = result.text.trim();
      break;
    }

    const act = parseAction(result.text);
    history.push({ role: "assistant", content: result.text.slice(0, 4000) });

    if (act.action === "done" || round === maxRounds) {
      finalText = act.action === "done" ? act.output : result.text;
      break;
    }

    if (act.action === "search") {
      searchesUsed += 1;
      const found = await searchWeb(act.query);
      evidence.push(clip(`SEARCH ${act.query}\n${found}`, 1800));
      history.push({ role: "user", content: `SEARCH_RESULT for ${act.query}:\n${clip(found, 4000)}\nChoose next action.` });
      continue;
    }

    if (fetchesUsed >= opts.remainingFetches) {
      history.push({ role: "user", content: "FETCH budget exhausted. action=done now." });
      continue;
    }
    const page = await fetchPublicPage(act.url, opts.signal);
    fetchesUsed += 1;
    const body = page.ok
      ? `FETCH ${page.url}\nTITLE ${page.title}\n${page.text}`
      : `FETCH FAILED ${page.url}: ${page.error}`;
    evidence.push(clip(body, 1800));
    history.push({ role: "user", content: `${clip(body, 4000)}\nChoose next action.` });
  }

  void searchesUsed;

  return {
    text: clip((finalText || "").trim() || "(empty worker output)"),
    evidence: evidence.map((e) => clip(e, 1800)),
    fetchesUsed,
    model: lastModel,
    provider: lastProvider,
    usage: { promptTokens, completionTokens },
  };
}

export function collectUpstream(task: SwarmTask, siblings: SwarmTask[]): string {
  const byId = new Map(siblings.map((t) => [t.id, t]));
  const parts: string[] = [];
  for (const id of task.dependsOn) {
    const src = byId.get(id);
    if (!src) continue;
    const block = [`## ${src.role} / ${src.id}`];
    if (src.result) block.push(src.result);
    if (src.evidence?.length) block.push(`EVIDENCE:\n${src.evidence.join("\n---\n")}`);
    if (block.length > 1) parts.push(block.join("\n"));
  }
  return clip(parts.join("\n\n"), 10_000);
}
