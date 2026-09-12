// Shared Cursor control surface used by Claw tools AND /api/cursor/* routes.
// CCFL owns these jobs. Do not forward to Aion-Brain /api/agent/run or invent /api/agents.

import {
  cancelCursorRun,
  cursorMe,
  getCursorAgent,
  isCursorConfigured,
  launchCursorAgent,
  listCursorAgents,
  replyCursorAgent,
  cursorMissingKey,
} from "./cloud-agents";
import type { CursorControlResult, CursorLaunchInput, CursorMode } from "./types";

export type CursorControlInput = {
  op?: string;
  id?: string;
  runId?: string;
  prompt?: string;
  goal?: string;
  text?: string;
  repo?: string;
  repository?: string;
  url?: string;
  ref?: string;
  startingRef?: string;
  name?: string;
  model?: string;
  mode?: string;
  autoCreatePR?: boolean;
  successCriteria?: unknown;
  criteria?: unknown;
  context?: string;
  noRepo?: boolean;
  limit?: number;
  cursor?: string;
  includeArchived?: boolean;
};

function modeOf(raw: unknown): CursorMode | undefined {
  const m = String(raw || "").toLowerCase();
  return m === "plan" || m === "agent" ? m : undefined;
}

function launchArgs(input: CursorControlInput): CursorLaunchInput {
  return {
    prompt: String(input.prompt || input.goal || input.text || "").trim(),
    repo: String(input.repo || input.repository || input.url || "").trim() || undefined,
    ref: String(input.ref || input.startingRef || "").trim() || undefined,
    name: String(input.name || "").trim() || undefined,
    model: String(input.model || "").trim() || undefined,
    mode: modeOf(input.mode),
    autoCreatePR: input.autoCreatePR,
    successCriteria: (input.successCriteria ?? input.criteria) as string[] | string | undefined,
    context: String(input.context || "").trim() || undefined,
    noRepo: input.noRepo === true,
  };
}

export async function runCursorControl(input: CursorControlInput): Promise<CursorControlResult> {
  if (!isCursorConfigured()) return cursorMissingKey();
  const op = String(input.op || "status").toLowerCase().trim();
  if (op === "launch" || op === "spawn" || op === "create") {
    return launchCursorAgent(launchArgs(input));
  }
  if (op === "list") {
    return listCursorAgents({
      limit: input.limit,
      cursor: input.cursor,
      includeArchived: input.includeArchived,
    });
  }
  if (op === "status" || op === "get") {
    const id = String(input.id || "").trim();
    if (!id) return listCursorAgents({ limit: input.limit, cursor: input.cursor, includeArchived: input.includeArchived });
    return getCursorAgent(id);
  }
  if (op === "reply" || op === "steer" || op === "followup" || op === "follow-up") {
    return replyCursorAgent({
      id: String(input.id || "").trim(),
      prompt: String(input.prompt || input.goal || input.text || "").trim(),
      mode: modeOf(input.mode),
    });
  }
  if (op === "cancel" || op === "stop") {
    return cancelCursorRun({ id: String(input.id || "").trim(), runId: String(input.runId || "").trim() || undefined });
  }
  if (op === "me" || op === "health") {
    return cursorMe();
  }
  return {
    ok: false,
    trinity: "HOLD",
    error: "unknown op. Use launch, status, reply, cancel, list, me.",
    code: "BAD_ARGS",
    owner: "ccfl",
  };
}

export const CURSOR_OWNERSHIP_CONTRACT =
  "CCFL owns Cursor Cloud Agent orchestration (CURSOR_API_KEY → api.cursor.com). " +
  "Aion-Brain POST /api/claw/execute (alias /api/agent/run) is brain tool execution — not Cursor. " +
  "There is no /api/agents handshake with Aion-Brain. Do not invent agent_jobs on Brain for this path.";
