// Convert Claw tool defs + runtime execution tools into OpenAI/NIM function tools.
import type { OpenAITool } from "@/lib/nvidia/client";
import { CLAW_TOOLS } from "@/lib/claw/tools";

export type ParsedToolCall = { id?: string; name: string; args: Record<string, unknown> };

export const RUNTIME_TOOL_DEFS: Array<{ name: string; description: string; parameters: Record<string, unknown> }> = [
  {
    name: "execution_plan",
    description: "Record the operator goal, steps, and 1–20 acceptance checks before acting on a build/fix/create/deploy/test request. Required before other tools on those work requests.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["goal", "steps", "checks"],
      properties: {
        goal: { type: "string" },
        steps: { type: "array", items: { type: "string" }, minItems: 1 },
        checks: {
          type: "array",
          minItems: 1,
          maxItems: 20,
          items: {
            type: "object",
            required: ["id", "description", "kind"],
            properties: {
              id: { type: "string" },
              description: { type: "string" },
              kind: { type: "string", enum: ["artifact", "command", "browser"] }
            }
          }
        }
      }
    }
  },
  {
    name: "execution_verify",
    description: "Mark one acceptance check as passed using a current-revision evidence id from a prior tool_result.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["check", "evidence"],
      properties: {
        check: { type: "string" },
        evidence: { type: "string" },
        path: { type: "string", description: "Dot path into the tool result for command/browser checks." }
      }
    }
  },
  {
    name: "execution_blocked",
    description: "Stop the turn and report the exact missing capability or unresolved failure. Use instead of inventing a Done claim.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["reason"],
      properties: { reason: { type: "string" } }
    }
  }
];

function exampleToParameters(example: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(example) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { type: "object", additionalProperties: true };
    }
    const properties: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      properties[key] = inferSchema(value);
    }
    return { type: "object", additionalProperties: true, properties };
  } catch {
    return { type: "object", additionalProperties: true };
  }
}

function inferSchema(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) return { type: "array", items: value.length ? inferSchema(value[0]) : {} };
  if (value !== null && typeof value === "object") {
    const properties: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) properties[k] = inferSchema(v);
    return { type: "object", additionalProperties: true, properties };
  }
  if (typeof value === "boolean") return { type: "boolean" };
  if (typeof value === "number") return { type: "number" };
  return { type: "string" };
}

export function nvidiaToolDefinitions(): OpenAITool[] {
  const runtime = RUNTIME_TOOL_DEFS.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.parameters }
  }));
  const claw = CLAW_TOOLS.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: exampleToParameters(t.args) }
  }));
  return [...runtime, ...claw];
}

export function parseNativeToolCalls(calls: Array<{ id?: string; function?: { name?: string; arguments?: string } }>): ParsedToolCall[] {
  return calls.map((call, i) => {
    const name = String(call.function?.name || "").trim();
    if (!name) throw new Error("Native tool call is missing a function name.");
    let args: unknown = {};
    const raw = call.function?.arguments;
    if (typeof raw === "string" && raw.trim()) {
      args = JSON.parse(raw);
    }
    if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("Tool arguments must be a JSON object.");
    return { id: call.id || `call_${i}`, name, args: args as Record<string, unknown> };
  });
}

export function assistantToolPayload(calls: ParsedToolCall[], reasoningContent?: string) {
  return { kind: "assistant_turn" as const, reasoningContent: reasoningContent || undefined, calls };
}

export function getAssistantCalls(toolJson: unknown): ParsedToolCall[] {
  if (Array.isArray(toolJson)) return toolJson as ParsedToolCall[];
  if (toolJson && typeof toolJson === "object" && Array.isArray((toolJson as { calls?: unknown }).calls)) {
    return (toolJson as { calls: ParsedToolCall[] }).calls;
  }
  return [];
}

export function getAssistantReasoning(toolJson: unknown): string | undefined {
  if (toolJson && typeof toolJson === "object" && !Array.isArray(toolJson)) {
    const value = (toolJson as { reasoningContent?: unknown }).reasoningContent;
    return typeof value === "string" && value ? value : undefined;
  }
  return undefined;
}
