// Strategies Agent planner: a cross-channel, multi-week marketing plan
// (goals, channel mix, content pillars) — one level above the single-
// campaign planner in lib/nvidia/campaign-planner.ts. Same
// chatCompletion(jsonMode) contract as every other NVIDIA writer module.

import { chatCompletion, getNvidiaModel, isNvidiaEnabled, NvidiaAuthError, NvidiaDisabledError, NvidiaUpstreamError } from "./client";
import type { ChannelMixEntry } from "@/lib/strategies";

export type StrategyPlan = {
  goals: string[];
  channelMix: ChannelMixEntry[];
  contentPillars: string[];
  rationale: string;
};

export class NvidiaStrategyError extends Error {
  cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "NvidiaStrategyError";
    this.cause = cause;
  }
}

export type StrategyPlannerInput = {
  title: string;
  horizon: "weekly" | "monthly" | "quarterly";
  siteContext?: string | null;
  auditSummary?: string | null;
  liveChannels: string[];
  recentPerformanceSummary?: string | null;
};

const SYSTEM_PROMPT = `You are a marketing strategist inside an internal marketing operations application. Given a business's site context, a website audit summary, which distribution channels are actually connected, and a planning horizon, produce a cross-channel content strategy.

Output ONLY valid JSON. No prose, no markdown fences, no commentary.

Rules:
- Never invent case results, statistics, testimonials, or facts not supplied in the context.
- Only recommend channels from the supplied "live channels" list, or clearly mark a recommended-but-not-yet-connected channel in its rationale.
- goals: 3-6 concrete, measurable-sounding goals appropriate to the horizon (e.g. "Publish 2 SEO articles/week targeting local search intent").
- channelMix: one entry per channel with a cadence (e.g. "3x/week") and a one-sentence rationale for why that channel/cadence given the context.
- contentPillars: 3-6 recurring content themes/topics the business should keep returning to, grounded in the supplied topic focus/audience.
- rationale: 2-4 sentences explaining the overall strategic logic.

JSON contract: { "goals": ["..."], "channelMix": [{"channel":"...","cadence":"...","rationale":"..."}], "contentPillars": ["..."], "rationale": "..." }`;

export async function planStrategy(input: StrategyPlannerInput): Promise<StrategyPlan> {
  if (!isNvidiaEnabled()) throw new NvidiaDisabledError();
  const model = getNvidiaModel();
  if (model === "disabled") throw new NvidiaDisabledError();

  const userPrompt = [
    `Strategy title: ${input.title}`,
    `Planning horizon: ${input.horizon}`,
    `Site/brand context: ${input.siteContext || "(none provided)"}`,
    `Website audit summary: ${input.auditSummary || "(no audit available)"}`,
    `Live/connected channels: ${input.liveChannels.length ? input.liveChannels.join(", ") : "(none connected yet)"}`,
    `Recent performance summary: ${input.recentPerformanceSummary || "(no performance data available)"}`,
    `Return the JSON object now.`
  ].join("\n");

  let response;
  try {
    response = await chatCompletion({
      model,
      temperature: 0.5,
      maxTokens: 1800,
      jsonMode: true,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt }
      ]
    });
  } catch (e) {
    if (e instanceof NvidiaAuthError || e instanceof NvidiaUpstreamError) throw e;
    throw new NvidiaStrategyError("NVIDIA call failed", e);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(response.text);
  } catch {
    const stripped = response.text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    try {
      parsed = JSON.parse(stripped);
    } catch (e) {
      throw new NvidiaStrategyError(`NVIDIA returned non-JSON (finish=${response.finishReason})`, e);
    }
  }

  const goals: string[] = Array.isArray(parsed?.goals) ? parsed.goals.filter((x: any) => typeof x === "string").slice(0, 6).map((x: string) => x.trim().slice(0, 300)) : [];
  const channelMix: ChannelMixEntry[] = Array.isArray(parsed?.channelMix)
    ? parsed.channelMix
        .filter((x: any) => x && typeof x.channel === "string")
        .slice(0, 20)
        .map((x: any) => ({ channel: String(x.channel).trim().slice(0, 60), cadence: String(x.cadence || "").trim().slice(0, 60), rationale: String(x.rationale || "").trim().slice(0, 500) }))
    : [];
  const contentPillars: string[] = Array.isArray(parsed?.contentPillars) ? parsed.contentPillars.filter((x: any) => typeof x === "string").slice(0, 6).map((x: string) => x.trim().slice(0, 200)) : [];
  const rationale = typeof parsed?.rationale === "string" ? parsed.rationale.trim().slice(0, 1500) : "";

  if (!goals.length || !channelMix.length) throw new NvidiaStrategyError("Strategy planner returned an incomplete plan (missing goals or channel mix)");

  return { goals, channelMix, contentPillars, rationale };
}
