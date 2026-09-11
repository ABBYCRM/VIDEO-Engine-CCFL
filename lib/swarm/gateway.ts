import { chatCompletion, isNvidiaEnabled, getClawModel } from "@/lib/nvidia/client";
import {
  AGENT_CLAW_NVIDIA_MODEL,
  BITDEER_BASE,
  FALLBACK_CLAW_NVIDIA_MODEL,
  type NvidiaModelId,
} from "@/lib/nvidia/models";
import { SWARM_MAX_TOKENS } from "./policy";
import type { GatewayRequest, GatewayResult, ModelGateway, SwarmRole } from "./types";

function modelFor(role: SwarmRole): NvidiaModelId {
  if (role === "researcher") return FALLBACK_CLAW_NVIDIA_MODEL;
  return AGENT_CLAW_NVIDIA_MODEL;
}

function maxFor(role: SwarmRole, requested?: number): number {
  const cap = SWARM_MAX_TOKENS[role] ?? 500;
  if (!requested) return cap;
  return Math.min(cap, Math.max(64, requested));
}

export function routeLabel(role: SwarmRole): string {
  const model = modelFor(role);
  if (role === "planner") return `planner → ${model}`;
  if (role === "researcher") return `researcher → ${model}`;
  if (role === "critic") return `critic → ${model}`;
  return `leader → ${model}`;
}

let discovered: { at: number; ids: string[]; error?: string } | null = null;

export async function discoverProviderModels(): Promise<{ ids: string[]; error?: string }> {
  if (discovered && Date.now() - discovered.at < 5 * 60_000) return discovered;
  try {
    const res = await fetch(`${BITDEER_BASE}/models`, { method: "GET", signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      discovered = { at: Date.now(), ids: [], error: `models HTTP ${res.status}` };
      return discovered;
    }
    const body = (await res.json()) as { data?: Array<{ id?: string }> };
    const ids = (body.data || []).map((m) => String(m.id || "")).filter(Boolean);
    discovered = { at: Date.now(), ids };
    return discovered;
  } catch (e) {
    discovered = { at: Date.now(), ids: [], error: e instanceof Error ? e.message : "discover failed" };
    return discovered;
  }
}

function configuredMissing(ids: string[]): string[] {
  if (!ids.length) return [];
  return [AGENT_CLAW_NVIDIA_MODEL, FALLBACK_CLAW_NVIDIA_MODEL].filter((id) => id !== "disabled" && !ids.includes(id));
}

export function productionGateway(): ModelGateway {
  let available = false;
  try {
    available = isNvidiaEnabled();
  } catch {
    available = false;
  }
  const missing = discovered?.ids.length ? configuredMissing(discovered.ids) : [];
  const health = missing.length
    ? `Configured models missing from provider catalog: ${missing.join(", ")}.`
    : discovered?.error
      ? `Model catalog: ${discovered.error}.`
      : "";
  return {
    name: "bitdeer",
    available,
    note: available
      ? `Bitdeer ${AGENT_CLAW_NVIDIA_MODEL} (planner/critic/leader), ${FALLBACK_CLAW_NVIDIA_MODEL} (research). Claw model ${getClawModel()}. ${health}`.trim()
      : "Bitdeer is not configured (BITDEER_API_KEY)",
    complete: async (req: GatewayRequest): Promise<GatewayResult> => {
      if (!discovered) void discoverProviderModels();
      const primary = modelFor(req.role);
      const fallback = primary === AGENT_CLAW_NVIDIA_MODEL ? FALLBACK_CLAW_NVIDIA_MODEL : AGENT_CLAW_NVIDIA_MODEL;
      const models = [primary, fallback];
      let lastError: Error | null = null;
      for (const model of models) {
        try {
          const res = await chatCompletion({
            model,
            messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
            temperature: req.role === "synthesizer" ? 0.3 : 0.2,
            maxTokens: maxFor(req.role, req.maxTokens),
            jsonMode: req.jsonMode,
            signal: req.signal,
          });
          return {
            text: res.text,
            model: res.rawModel || model,
            provider: "bitdeer",
            usage: {
              promptTokens: res.usage?.promptTokens ?? 0,
              completionTokens: res.usage?.completionTokens ?? 0,
            },
          };
        } catch (e) {
          lastError = e instanceof Error ? e : new Error("gateway failed");
        }
      }
      throw lastError ?? new Error("Bitdeer gateway failed");
    },
  };
}
