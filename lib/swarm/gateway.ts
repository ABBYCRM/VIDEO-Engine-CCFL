import { chatCompletion, isNvidiaEnabled, getClawModel } from "@/lib/nvidia/client";
import {
  AGENT_CLAW_NVIDIA_MODEL,
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

export function productionGateway(): ModelGateway {
  const available = isNvidiaEnabled();
  return {
    name: "bitdeer",
    available,
    note: available
      ? `Bitdeer ${AGENT_CLAW_NVIDIA_MODEL} (planner/critic/leader), ${FALLBACK_CLAW_NVIDIA_MODEL} (research). Claw model ${getClawModel()}.`
      : "Bitdeer is not configured (BITDEER_API_KEY)",
    complete: async (req: GatewayRequest): Promise<GatewayResult> => {
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
