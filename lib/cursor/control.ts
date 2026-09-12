// Thin CCFL proxy. Aion-Brain owns Cursor (lib/cursor_cloud.js, PR #11).
// Do not call api.cursor.com from this process.

import {
  aionCursorCancel,
  aionCursorLaunch,
  aionCursorReply,
  aionCursorStatus,
  isAionConfigured,
  type AionCursorResult,
} from "@/lib/claw/aion";

export type CursorControlInput = {
  op?: string;
  id?: string;
  runId?: string;
  prompt?: string;
  goal?: string;
  text?: string;
  message?: string;
  repo?: string;
  repository?: string;
  url?: string;
  repos?: unknown;
  ref?: string;
  startingRef?: string;
  branch?: string;
  name?: string;
  model?: unknown;
  mode?: string;
  autoCreatePR?: boolean;
  workOnCurrentBranch?: boolean;
  limit?: number;
  cursor?: string;
};

export function isCursorProxyReady(): boolean {
  return isAionConfigured();
}

export const CURSOR_OWNERSHIP_CONTRACT =
  "Aion-Brain owns Cursor Cloud Agents (lib/cursor_cloud.js → POST /api/cursor/launch). " +
  "CCFL forwards with AION_BASE_URL + AION_API_KEY (X-AION-Key). " +
  "CURSOR_API_KEY lives on Brain. Aion /api/agent/run remains claw execute — not this path.";

export async function runCursorControl(input: CursorControlInput): Promise<AionCursorResult> {
  const op = String(input.op || "status").toLowerCase().trim();
  const prompt = String(input.prompt || input.goal || input.text || input.message || "").trim();
  const repo = String(input.repo || input.repository || input.url || "").trim() || undefined;
  if (op === "launch" || op === "spawn" || op === "create") {
    return aionCursorLaunch({
      prompt,
      repo,
      repository: repo,
      repos: input.repos,
      branch: input.branch || input.ref,
      startingRef: input.startingRef || input.ref || input.branch,
      name: input.name,
      model: input.model,
      autoCreatePR: input.autoCreatePR,
      workOnCurrentBranch: input.workOnCurrentBranch,
      mode: input.mode,
    });
  }
  if (op === "list") {
    return aionCursorStatus({ limit: input.limit, cursor: input.cursor });
  }
  if (op === "status" || op === "get" || op === "result") {
    return aionCursorStatus({ id: input.id, runId: input.runId, limit: input.limit, cursor: input.cursor });
  }
  if (op === "reply" || op === "steer" || op === "followup" || op === "follow-up") {
    return aionCursorReply({ id: input.id, prompt, mode: input.mode });
  }
  if (op === "cancel" || op === "stop") {
    return aionCursorCancel({ id: input.id, runId: input.runId });
  }
  return {
    ok: false,
    source: "ccfl-proxy",
    owner: "aion-brain",
    trinity: "HOLD",
    error: "unknown op. Use launch, status, reply, cancel.",
    code: "BAD_ARGS",
  };
}
