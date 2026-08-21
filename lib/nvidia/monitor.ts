// NVIDIA Performance Monitor.
//
// Inputs: a flat list of normalized ad-account metrics, grouped by the
// dimensions we care about (prompt set, hook, avatar, platform, etc.).
// Output: a MonitorRun with findings + recommendations.
//
// The contract is the operator's brief, section 4B:
//   - When ad metrics are available: produce findings, recommendations,
//     record model + inputs + rationale + timestamp + scope.
//   - When no metrics are available: status="dormant", no fabrication.
//
// Inputs MUST be the only source of truth for numbers — the model is
// forbidden from inventing spend, CTR, conversions, ROAS, etc.

import crypto from "node:crypto";
import { chatCompletion, getNvidiaModel, isNvidiaEnabled, NvidiaAuthError, NvidiaDisabledError, NvidiaUpstreamError } from "./client";
import { parseMonitorRun, SchemaError, type MonitorRun } from "./schemas";

export type AdMetric = {
  id: string;
  campaignId?: string;
  providerId?: string;
  dimension: "prompt" | "hook" | "avatar" | "copy" | "cta" | "style" | "platform" | "audience";
  subject: string;
  spend?: number;
  impressions?: number;
  reach?: number;
  clicks?: number;
  leads?: number;
  conversions?: number;
  revenue?: number;
  recordedAt: string; // ISO timestamp
};

export type MonitorInput = {
  scope: string;          // "global" | "campaign:<id>" | "provider:<id>"
  metrics: AdMetric[];    // flat list, may be empty
  note?: string;          // operator-supplied note
};

export class NvidiaMonitorError extends Error {
  constructor(message: string) { super(message); this.name = "NvidiaMonitorError"; }
}

const SYSTEM_PROMPT = `You are NVIDIA Performance Monitor for a video advertising engine.

You receive a JSON list of normalized ad-account metrics, each tagged with a dimension (prompt, hook, avatar, copy, cta, style, platform, audience) and a subject identifier. Each metric has optional spend, impressions, reach, clicks, leads, conversions, revenue. Computed fields (CTR, CPC, CPL, CPA, ROAS) may be derived by simple division over the supplied values only. NEVER invent numbers.

Your job:
1. Identify winners, losers, weak-data items, and opportunities. Each finding MUST cite the metric ids that support it.
2. Recommend changes (one per recommendation) with appliesTo { campaignId?, providerId?, scope? }, change, expectedImpact, confidence (low|medium|high).
3. If the metrics list is empty OR the data is too thin to draw conclusions, return status="dormant" and a reason. DO NOT fabricate ROI, ROAS, or rankings.
4. Output ONLY valid JSON. No prose, no markdown fences.

JSON contract:
{
  "status": "ok" | "dormant" | "error",
  "reason": "string (required when status != ok)",
  "findings": [
    { "id": "string", "kind": "winner|loser|weak-data|opportunity", "dimension": "...", "subject": "string", "metricIds": ["m1", ...], "summary": "string" }
  ],
  "recommendations": [
    { "id": "string", "appliesTo": { "campaignId": "...", "providerId": "...", "scope": "..." }, "change": "string", "expectedImpact": "string", "confidence": "low|medium|high" }
  ]
}`;

function buildUserPrompt(input: MonitorInput): string {
  return [
    `Scope: ${input.scope}`,
    input.note ? `Operator note: ${input.note}` : "",
    `Metric count: ${input.metrics.length}`,
    ``,
    `Metrics JSON (the only source of numbers):`,
    JSON.stringify(input.metrics)
  ].filter(Boolean).join("\n");
}

function dormantRun(scope: string, model: import("./models").NvidiaModelId, metricCount: number, reason: string): MonitorRun {
  return parseMonitorRun({ status: "dormant", reason }, model, scope, metricCount);
}

export async function runMonitor(input: MonitorInput): Promise<MonitorRun> {
  if (!isNvidiaEnabled()) {
    return dormantRun(input.scope, "disabled", input.metrics.length, "NVIDIA is disabled in settings.");
  }
  const model = getNvidiaModel();
  if (model === "disabled") {
    return dormantRun(input.scope, "disabled", input.metrics.length, "NVIDIA is disabled in settings.");
  }

  const scope = input.scope || "global";
  if (input.metrics.length === 0) {
    return dormantRun(scope, model, 0, "no ad-account metrics available");
  }

  const inputHash = crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex");
  let response;
  try {
    response = await chatCompletion({
      model,
      temperature: 0.3,
      topP: 0.9,
      maxTokens: 1400,
      jsonMode: true,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(input) }
      ]
    });
  } catch (e) {
    if (e instanceof NvidiaAuthError) throw new NvidiaMonitorError(`Monitor auth failed: ${e.message}`);
    if (e instanceof NvidiaUpstreamError) throw new NvidiaMonitorError(`Monitor upstream failed: ${e.message}`);
    throw new NvidiaMonitorError("Monitor call failed");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(response.text);
  } catch {
    const stripped = response.text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    try { parsed = JSON.parse(stripped); } catch { return dormantRun(scope, model, input.metrics.length, "model returned non-JSON"); }
  }
  try {
    return parseMonitorRun(parsed, model, scope, input.metrics.length);
  } catch (e) {
    if (e instanceof SchemaError) return dormantRun(scope, model, input.metrics.length, `output failed validation: ${e.message}`);
    throw e;
  }
  // inputHash available if a future caller wants to record dedupe
  void inputHash;
}
