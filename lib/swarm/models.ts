/** Provider-neutral model classes. Workers ask for a class; the gateway picks Bitdeer/Mistral. */
export const MODEL_CLASSES = {
  planner: { provider: "bitdeer" as const, env: "BITDEER_PLANNER_MODEL", fallback: "planner" },
  "research-fast": { provider: "bitdeer" as const, env: "BITDEER_RESEARCH_MODEL", fallback: "researcher" },
  critic: { provider: "mistral" as const, env: "MISTRAL_CRITIC_MODEL", fallback: "critic" },
  synthesis: { provider: "mistral" as const, env: "MISTRAL_SYNTH_MODEL", fallback: "synthesizer" },
} as const;

export type ModelClass = keyof typeof MODEL_CLASSES;

export function classForRole(role: string): ModelClass {
  if (role === "planner") return "planner";
  if (role === "researcher") return "research-fast";
  if (role === "critic") return "critic";
  return "synthesis";
}
