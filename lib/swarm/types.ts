export const SWARM_ROLES = ["planner", "researcher", "critic", "synthesizer"] as const;
export type SwarmRole = (typeof SWARM_ROLES)[number];

export const RUN_STATUSES = [
  "queued",
  "planning",
  "running",
  "synthesizing",
  "completed",
  "failed",
  "cancelling",
  "cancelled",
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const TASK_STATES = [
  "pending",
  "ready",
  "leased",
  "running",
  "completed",
  "failed",
  "cancelled",
] as const;
export type TaskState = (typeof TASK_STATES)[number];

export type TokenUsage = {
  promptTokens: number;
  completionTokens: number;
  calls: number;
};

export type SwarmLimits = {
  maxAgents: number;
  maxDepth: number;
  maxAttempts: number;
  deadlineMs: number;
  maxLlmCalls: number;
  maxFetches: number;
  mode: "auto" | "led";
};

export type PlannedTask = {
  id: string;
  role: Exclude<SwarmRole, "planner">;
  objective: string;
  dependsOn: string[];
  urls?: string[];
};

export type SwarmTask = {
  id: string;
  runId: string;
  parentId: string | null;
  role: Exclude<SwarmRole, "planner">;
  objective: string;
  dependsOn: string[];
  urls: string[];
  state: TaskState;
  attempt: number;
  provider: string;
  model: string;
  result: string | null;
  evidence: string[];
  error: string | null;
  usage: TokenUsage;
  startedAt: number | null;
  completedAt: number | null;
};

export type SwarmEventData = {
  objective?: string;
  error?: string | null;
  count?: number;
  roles?: string[];
  role?: string;
  model?: string;
  attempt?: number;
  via?: string;
  reason?: string;
};

export type SwarmMessage = {
  id: string;
  runId: string;
  taskId: string | null;
  fromRole: string;
  body: string;
  at: number;
};

export type SwarmEvent = {
  id: string;
  runId: string;
  taskId: string | null;
  type: string;
  at: number;
  data: SwarmEventData;
};

export type SwarmRun = {
  id: string;
  objective: string;
  status: RunStatus;
  limits: SwarmLimits;
  deadlineAt: number;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
  leaderAnswer: string | null;
  error: string | null;
  usage: TokenUsage;
  providerNote: string;
};

export type PublicSwarmTask = Pick<
  SwarmTask,
  "id" | "role" | "objective" | "dependsOn" | "state" | "attempt" | "provider" | "model" | "result" | "evidence" | "error" | "usage" | "startedAt" | "completedAt"
>;

export type PublicSwarmRun = SwarmRun & {
  tasks: PublicSwarmTask[];
  events: SwarmEvent[];
};

export type GatewayMessage = { role: "system" | "user" | "assistant"; content: string };

export type GatewayRequest = {
  role: SwarmRole;
  messages: GatewayMessage[];
  maxTokens: number;
  jsonMode?: boolean;
  signal?: AbortSignal;
};

export type GatewayResult = {
  text: string;
  model: string;
  provider: string;
  usage: { promptTokens: number; completionTokens: number };
};

export type ModelGateway = {
  name: string;
  available: boolean;
  note: string;
  complete: (req: GatewayRequest) => Promise<GatewayResult>;
};

export const SWARM_CONTRACT = {
  name: "Claw Swarm",
  pattern: "supervisor + planner + durable tasks + worker pool + leader synthesis",
  not: [
    "Not a process-per-agent container farm",
    "Does not steal the Computer Chrome session",
    "Does not farm CAPTCHAs or rotate residential proxies",
    "Does not expose subagent chain-of-thought — only task outputs and the leader answer",
  ],
  transport: "SQLite working set mirrored to Managed PostgreSQL when DATABASE_URL is set; leases + recovery; Claw-led spawn/wait/message; SSE /api/swarm/:id/events",
  providers: "Bitdeer: planner/critic/leader = Mistral Large 3 675B; researcher = GLM-5 with Mistral fallback",
} as const;
