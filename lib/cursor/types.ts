// Public types for Cursor Cloud Agents v1 (https://api.cursor.com).
// CCFL owns this orchestration. Aion-Brain /api/agent/run is claw execute — not Cursor.

export const CURSOR_API_DEFAULT_BASE = "https://api.cursor.com";
export const CURSOR_DEFAULT_REPO = "https://github.com/ABBYCRM/VIDEO-Engine-CCFL";

export type CursorAgentStatus = "ACTIVE" | "IDLE" | "ARCHIVED" | string;
export type CursorRunStatus = "CREATING" | "RUNNING" | "FINISHED" | "ERROR" | "CANCELLED" | "EXPIRED" | string;
export type CursorMode = "agent" | "plan";

export type CursorRepo = {
  url: string;
  startingRef?: string;
  prUrl?: string;
};

export type CursorPrompt = {
  text: string;
};

export type CursorAgent = {
  id: string;
  name?: string;
  status?: CursorAgentStatus;
  url?: string;
  repos?: CursorRepo[];
  latestRunId?: string;
  createdAt?: string;
  updatedAt?: string;
  autoCreatePR?: boolean;
};

export type CursorRun = {
  id: string;
  agentId?: string;
  status?: CursorRunStatus;
  createdAt?: string;
  updatedAt?: string;
  durationMs?: number;
  result?: string;
  git?: { branches?: Array<{ repoUrl?: string; branch?: string; prUrl?: string }> };
};

export type CursorLaunchInput = {
  prompt: string;
  repo?: string;
  ref?: string;
  name?: string;
  model?: string;
  mode?: CursorMode;
  autoCreatePR?: boolean;
  successCriteria?: string[] | string;
  context?: string;
  noRepo?: boolean;
};

export type CursorControlResult = {
  ok: boolean;
  via?: "cursor";
  op?: string;
  trinity?: "GO" | "HOLD" | "ABORT";
  error?: string;
  code?: string;
  hint?: string;
  status?: number;
  agent?: CursorAgent | null;
  run?: CursorRun | null;
  agents?: CursorAgent[];
  nextCursor?: string;
  owner?: "ccfl";
  contract?: string;
};
