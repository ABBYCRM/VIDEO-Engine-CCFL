// AGENTIC SELF-STATE CONTROL LOOP
//
// Every Claw turn is driven by this state machine. The model is an actor
// inside the loop — it does not get to declare COMPLETE, treat a plan as
// executed, or retry a failed strategy without new evidence.

export type EpistemicStatus = "KNOWN" | "INFERRED" | "ASSUMED" | "UNKNOWN" | "CONTRADICTED";

export type Health = "HEALTHY" | "DEGRADED" | "LOOP_DETECTED" | "BLOCKED" | "UNSTABLE";

export type IntrospectionIssue =
  | "INFORMATION_GAP"
  | "ASSUMPTION_FAILURE"
  | "REASONING_FAILURE"
  | "PLANNING_FAILURE"
  | "TOOL_FAILURE"
  | "EXECUTION_FAILURE"
  | "STRATEGY_FAILURE"
  | "NONE";

export type CyclePhase =
  | "SELF-OBSERVATION"
  | "SELF-MONITORING"
  | "INTROSPECTION"
  | "METACOGNITION"
  | "SELF-REFLECTION"
  | "METACONTROL"
  | "ACTION"
  | "TERMINATION_CHECK";

export type EpistemicItem = {
  id: string;
  claim: string;
  status: EpistemicStatus;
  evidence?: string;
};

export type ToolResultRecord = {
  name: string;
  ok: boolean;
  preview: string;
  evidenceId?: string;
  strategy?: string;
  at: number;
};

export type ToolStatus = "idle" | "running" | "ok" | "error" | "forbidden";

export type SelfState = {
  active_goal: string;
  current_plan: string[];
  current_step: string;
  completed_steps: string[];
  pending_steps: string[];
  working_memory: string[];
  relevant_long_term_memory: string[];
  assumptions: EpistemicItem[];
  known_facts: EpistemicItem[];
  unknowns: EpistemicItem[];
  uncertainties: EpistemicItem[];
  current_strategy: string;
  alternative_strategies: string[];
  available_tools: string[];
  tool_status: Record<string, ToolStatus>;
  previous_tool_results: ToolResultRecord[];
  errors: string[];
  warnings: string[];
  blockers: string[];
  resource_usage: { rounds: number; tools: number; elapsedMs: number };
  remaining_budget: { rounds: number; ms: number };
  progress: number;
  confidence: number;
  expected_outcome: string;
  observed_outcome: string;
};

export type PublicSelfState = {
  health: Health;
  issue: IntrospectionIssue;
  phase: CyclePhase;
  progress: number;
  confidence: number;
  goal: string;
  step: string;
  strategy: string;
  forbiddenStrategy: string | null;
  blockers: string[];
  lastTool: string | null;
  toolsRun: number;
  rounds: number;
};

export type CycleResult = {
  health: Health;
  issue: IntrospectionIssue;
  phase: CyclePhase;
  forceTool: boolean;
  forbidRetry: boolean;
  forbiddenStrategy: string | null;
  requireDifferentAction: boolean;
  complete: boolean;
  instruction: string;
  public: PublicSelfState;
};

export type TerminationInput = {
  wantsComplete: boolean;
  acceptanceVerified: boolean;
  requiresAcceptance: boolean;
  hasPendingToolIntent: boolean;
};

const MAX_MEMORY = 24;
const LOOP_FAILURES = 2;

function clipList<T>(items: T[], n = MAX_MEMORY): T[] {
  return items.length > n ? items.slice(-n) : items;
}

function fingerprint(value: unknown): string {
  if (typeof value === "string") return value.trim().replace(/\s+/g, " ").slice(0, 240).toLowerCase();
  try { return JSON.stringify(value).slice(0, 240); }
  catch { return String(value).slice(0, 240); }
}

function strategyKey(strategy: string, action: string): string {
  return `${fingerprint(strategy)}::${fingerprint(action)}`;
}

export function createSelfState(input: {
  goal: string;
  tools: string[];
  maxRounds: number;
  budgetMs: number;
  longTerm?: string[];
}): SelfState {
  return {
    active_goal: input.goal,
    current_plan: [],
    current_step: "observe",
    completed_steps: [],
    pending_steps: ["observe", "act", "verify"],
    working_memory: [`Goal received: ${input.goal.slice(0, 200)}`],
    relevant_long_term_memory: input.longTerm?.slice(0, 8) ?? [],
    assumptions: [],
    known_facts: [],
    unknowns: [{ id: "u0", claim: "Acceptance criteria not yet verified", status: "UNKNOWN" }],
    uncertainties: [],
    current_strategy: "observe-then-act",
    alternative_strategies: ["consult-aion", "switch-tool-family", "ask-for-blocker", "use-fallback-provider"],
    available_tools: [...input.tools],
    tool_status: Object.fromEntries(input.tools.map((t) => [t, "idle" as ToolStatus])),
    previous_tool_results: [],
    errors: [],
    warnings: [],
    blockers: [],
    resource_usage: { rounds: 0, tools: 0, elapsedMs: 0 },
    remaining_budget: { rounds: input.maxRounds, ms: input.budgetMs },
    progress: 0,
    confidence: 0,
    expected_outcome: "",
    observed_outcome: ""
  };
}

export class SelfStateController {
  readonly state: SelfState;
  readonly startedAt = Date.now();
  private readonly maxRounds: number;
  private readonly budgetMs: number;
  private evidenceSeq = 0;
  private lastEvidenceSeq = 0;
  private readonly failures = new Map<string, { count: number; lastEvidenceSeq: number }>();
  private readonly forbidden = new Set<string>();
  private readonly forbiddenActions = new Set<string>();
  private lastAction = "";
  private lastStrategy = "";
  private intendedTools: string[] = [];
  private lastHealth: Health = "HEALTHY";
  private lastIssue: IntrospectionIssue = "NONE";
  private lastPhase: CyclePhase = "SELF-OBSERVATION";

  constructor(state: SelfState, limits: { maxRounds: number; budgetMs: number }) {
    this.state = state;
    this.maxRounds = limits.maxRounds;
    this.budgetMs = limits.budgetMs;
  }

  snapshot(): SelfState {
    return this.state;
  }

  publicSnapshot(): PublicSelfState {
    const last = this.state.previous_tool_results.at(-1);
    return {
      health: this.lastHealth,
      issue: this.lastIssue,
      phase: this.lastPhase,
      progress: this.state.progress,
      confidence: this.state.confidence,
      goal: this.state.active_goal.slice(0, 160),
      step: this.state.current_step,
      strategy: this.state.current_strategy,
      forbiddenStrategy: this.forbidden.size ? [...this.forbidden].at(-1) ?? null : null,
      blockers: this.state.blockers.slice(-4),
      lastTool: last?.name ?? null,
      toolsRun: this.state.previous_tool_results.length,
      rounds: this.state.resource_usage.rounds
    };
  }

  remember(note: string) {
    this.state.working_memory = clipList([...this.state.working_memory, note]);
  }

  setPlan(plan: string[], step?: string) {
    this.state.current_plan = plan.filter((s) => typeof s === "string" && s.trim());
    if (step) this.state.current_step = step;
    this.state.pending_steps = this.state.current_plan.filter((s) => !this.state.completed_steps.includes(s));
  }

  completeStep(step: string) {
    if (!this.state.completed_steps.includes(step)) this.state.completed_steps = clipList([...this.state.completed_steps, step]);
    this.state.pending_steps = this.state.current_plan.filter((s) => !this.state.completed_steps.includes(s));
    this.state.current_step = this.state.pending_steps[0] || "verify";
  }

  addFact(claim: string, status: EpistemicStatus, evidence?: string) {
    const item: EpistemicItem = { id: `e${this.state.known_facts.length + this.state.assumptions.length + 1}`, claim, status, evidence };
    if (status === "ASSUMED") this.state.assumptions = clipList([...this.state.assumptions, item]);
    else if (status === "UNKNOWN") this.state.unknowns = clipList([...this.state.unknowns, item]);
    else if (status === "CONTRADICTED") this.state.uncertainties = clipList([...this.state.uncertainties, item]);
    else this.state.known_facts = clipList([...this.state.known_facts, item]);
  }

  noteIntendedTools(names: string[]) {
    this.intendedTools = names.filter(Boolean);
  }

  ingestAionResults(results: Array<{ name: string; ok: boolean; preview?: string; evidence_id?: string }>) {
    for (const result of results) {
      this.recordTool({
        name: result.name,
        ok: result.ok,
        preview: result.preview || (result.ok ? "Aion tool result" : "Aion tool failed"),
        evidenceId: result.evidence_id,
        strategy: "aion-execute"
      });
    }
  }

  recordTool(input: { name: string; ok: boolean; preview: string; evidenceId?: string; strategy?: string }) {
    const record: ToolResultRecord = {
      name: input.name,
      ok: input.ok,
      preview: input.preview.slice(0, 400),
      evidenceId: input.evidenceId,
      strategy: input.strategy || this.state.current_strategy,
      at: Date.now()
    };
    this.state.previous_tool_results = clipList([...this.state.previous_tool_results, record], 40);
    this.state.tool_status[input.name] = input.ok ? "ok" : "error";
    this.state.resource_usage.tools += 1;
    this.state.observed_outcome = `${input.name} ${input.ok ? "ok" : "failed"}`;
    if (input.ok) {
      this.evidenceSeq += 1;
      this.lastEvidenceSeq = this.evidenceSeq;
      this.addFact(`${input.name} returned a result`, "KNOWN", input.evidenceId);
      this.completeStep(this.state.current_step === "observe" ? "act" : this.state.current_step);
    } else {
      this.state.errors = clipList([...this.state.errors, `${input.name}: ${input.preview.slice(0, 160)}`]);
      this.recordStrategyFailure(input.strategy || this.state.current_strategy, `${input.name}:${fingerprint(input.preview)}`);
    }
    this.intendedTools = this.intendedTools.filter((n) => n !== input.name);
    this.updateProgress();
  }

  recordStrategyFailure(strategy: string, action: string) {
    const key = strategyKey(strategy, action);
    const prev = this.failures.get(key);
    const sameEvidence = prev ? prev.lastEvidenceSeq === this.evidenceSeq : true;
    const count = prev && sameEvidence ? prev.count + 1 : 1;
    this.failures.set(key, { count, lastEvidenceSeq: this.evidenceSeq });
    this.lastStrategy = strategy;
    this.lastAction = action;
    if (count >= LOOP_FAILURES && sameEvidence) {
      this.forbidden.add(key);
      this.forbiddenActions.add(fingerprint(action));
      const toolName = action.split(":")[0] || strategy;
      if (toolName) this.state.tool_status[toolName] = "forbidden";
      this.state.warnings = clipList([...this.state.warnings, `Strategy "${strategy}" failed ${count} times with no new evidence`]);
    }
  }

  isForbidden(strategy: string, action: string): boolean {
    return this.forbidden.has(strategyKey(strategy, action)) || this.forbiddenActions.has(fingerprint(action));
  }

  setStrategy(strategy: string) {
    if (strategy && strategy !== this.state.current_strategy) {
      const previous = this.state.current_strategy;
      if (previous && !this.state.alternative_strategies.includes(previous)) {
        this.state.alternative_strategies = clipList([previous, ...this.state.alternative_strategies]);
      }
      this.state.current_strategy = strategy;
      this.remember(`Strategy changed to ${strategy}`);
    }
  }

  setExpected(outcome: string) {
    this.state.expected_outcome = outcome.slice(0, 400);
  }

  observeModelText(text: string) {
    this.state.observed_outcome = fingerprint(text).slice(0, 200);
    const mentioned = this.state.available_tools.filter((name) => text.includes(name));
    if (mentioned.length) this.noteIntendedTools(mentioned);
    if (/\b(i will|let me|going to|plan to)\b/i.test(text) && mentioned.length) {
      this.addFact("Model described a tool action without executing it", "INFERRED");
    }
  }

  tick(round: number) {
    this.state.resource_usage.rounds = round + 1;
    this.state.resource_usage.elapsedMs = Date.now() - this.startedAt;
    this.state.remaining_budget.rounds = Math.max(0, this.maxRounds - this.state.resource_usage.rounds);
    this.state.remaining_budget.ms = Math.max(0, this.budgetMs - this.state.resource_usage.elapsedMs);
    this.updateProgress();
  }

  private updateProgress() {
    const tools = this.state.previous_tool_results.length;
    const done = this.state.completed_steps.length;
    const pending = this.state.pending_steps.length;
    const raw = pending + done === 0 ? (tools > 0 ? 0.4 : 0.1) : done / (done + pending);
    this.state.progress = Math.max(0, Math.min(0.95, raw));
    // Confidence is a self-report, never proof of completion.
    this.state.confidence = Math.max(0, Math.min(0.85, 0.2 + tools * 0.08 + done * 0.1));
  }

  observe(): SelfState {
    this.lastPhase = "SELF-OBSERVATION";
    this.tick(Math.max(0, this.state.resource_usage.rounds - 1));
    return this.state;
  }

  monitor(): Health {
    this.lastPhase = "SELF-MONITORING";
    const lastKey = this.lastStrategy && this.lastAction ? strategyKey(this.lastStrategy, this.lastAction) : "";
    const looped = lastKey ? (this.failures.get(lastKey)?.count ?? 0) >= LOOP_FAILURES && this.forbidden.has(lastKey) : false;
    if (this.state.blockers.length && this.state.remaining_budget.rounds <= 0) {
      this.lastHealth = "BLOCKED";
    } else if (looped) {
      this.lastHealth = "LOOP_DETECTED";
    } else if (this.state.errors.length >= 2 || this.state.remaining_budget.ms < 15_000) {
      this.lastHealth = "DEGRADED";
    } else if (this.intendedTools.length && this.state.previous_tool_results.length === 0) {
      this.lastHealth = "UNSTABLE";
    } else {
      this.lastHealth = "HEALTHY";
    }
    return this.lastHealth;
  }

  introspect(): IntrospectionIssue {
    this.lastPhase = "INTROSPECTION";
    if (this.lastHealth === "LOOP_DETECTED") this.lastIssue = "STRATEGY_FAILURE";
    else if (this.state.errors.some((e) => /tool|composio|scrape|sandbox/i.test(e))) this.lastIssue = "TOOL_FAILURE";
    else if (this.intendedTools.length && !this.state.previous_tool_results.some((r) => this.intendedTools.includes(r.name))) this.lastIssue = "EXECUTION_FAILURE";
    else if (this.state.current_plan.length === 0 && /build|implement|fix|create|research|scrape/i.test(this.state.active_goal)) this.lastIssue = "PLANNING_FAILURE";
    else if (this.state.assumptions.some((a) => a.status === "CONTRADICTED")) this.lastIssue = "ASSUMPTION_FAILURE";
    else if (this.state.unknowns.length && this.state.previous_tool_results.length === 0) this.lastIssue = "INFORMATION_GAP";
    else if (this.state.errors.length) this.lastIssue = "REASONING_FAILURE";
    else this.lastIssue = "NONE";
    return this.lastIssue;
  }

  metacognize() {
    this.lastPhase = "METACOGNITION";
    if (this.lastHealth === "LOOP_DETECTED") {
      this.state.confidence = Math.min(this.state.confidence, 0.25);
      this.state.warnings = clipList([...this.state.warnings, "Identical strategy failed twice with no new evidence. Retry is forbidden."]);
    }
    if (this.state.assumptions.length) {
      this.state.warnings = clipList([...this.state.warnings, "Assumptions are not facts. Do not treat them as KNOWN."]);
    }
    // Confidence is never treated as proof.
    if (this.state.confidence >= 0.8 && this.state.unknowns.some((u) => u.status === "UNKNOWN")) {
      this.state.confidence = 0.45;
      this.state.warnings = clipList([...this.state.warnings, "High confidence with unknowns is not evidence."]);
    }
  }

  reflect() {
    this.lastPhase = "SELF-REFLECTION";
    const last = this.state.previous_tool_results.at(-1);
    if (last) this.remember(`Last tool ${last.name} ${last.ok ? "succeeded" : "failed"}`);
    if (this.lastHealth === "LOOP_DETECTED") {
      this.remember("Loop detected: next action must be materially different.");
      const next = this.state.alternative_strategies.find((s) => !this.forbidden.has(strategyKey(s, this.lastAction))) || "use-fallback-provider";
      this.setStrategy(next);
    }
  }

  metacontrol(): { forceTool: boolean; forbidRetry: boolean; forbiddenStrategy: string | null; requireDifferentAction: boolean; instruction: string } {
    this.lastPhase = "METACONTROL";
    const forbidRetry = this.lastHealth === "LOOP_DETECTED";
    const requireDifferentAction = forbidRetry;
    const forceTool =
      this.lastIssue === "INFORMATION_GAP" ||
      this.lastIssue === "EXECUTION_FAILURE" ||
      this.lastIssue === "PLANNING_FAILURE" ||
      this.lastIssue === "TOOL_FAILURE" ||
      this.lastHealth === "LOOP_DETECTED" ||
      this.lastHealth === "UNSTABLE";
    const forbiddenStrategy = forbidRetry ? (this.lastAction || this.lastStrategy || this.state.current_strategy) : null;
    let instruction = `SELF_STATE health=${this.lastHealth} issue=${this.lastIssue} strategy=${this.state.current_strategy}.`;
    if (forbidRetry) {
      instruction += ` LOOP_DETECTED: do not retry "${forbiddenStrategy}". Take a materially different action (different tool, different args, aion_execute, aion_consult, or execution_blocked).`;
    }
    if (forceTool && this.lastIssue !== "NONE") {
      instruction += " Intended tool actions are not completed until a tool_result exists. Call a tool this turn.";
    }
    return { forceTool, forbidRetry, forbiddenStrategy, requireDifferentAction, instruction };
  }

  terminationCheck(input: TerminationInput): { complete: boolean; reason: string } {
    this.lastPhase = "TERMINATION_CHECK";
    if (input.hasPendingToolIntent) {
      return { complete: false, reason: "Intended tool actions were not executed. Missing info is not negative evidence." };
    }
    if (input.requiresAcceptance && !input.acceptanceVerified) {
      return { complete: false, reason: "COMPLETE is blocked: acceptance criteria are not verified." };
    }
    if (input.wantsComplete && input.requiresAcceptance && !input.acceptanceVerified) {
      return { complete: false, reason: "Model claimed completion without verified acceptance criteria." };
    }
    if (this.lastHealth === "LOOP_DETECTED" && !input.acceptanceVerified) {
      return { complete: false, reason: "LOOP_DETECTED: cannot complete on a repeated failed strategy." };
    }
    if (!input.wantsComplete) return { complete: false, reason: "Turn still in progress." };
    if (input.requiresAcceptance && input.acceptanceVerified) {
      this.state.progress = 1;
      this.state.current_step = "complete";
      return { complete: true, reason: "Acceptance criteria verified against recorded tool evidence." };
    }
    if (!input.requiresAcceptance && this.lastHealth !== "LOOP_DETECTED") {
      return { complete: true, reason: "No acceptance gate required." };
    }
    return { complete: false, reason: "Termination gate refused COMPLETE." };
  }

  cycle(input?: { round?: number }): CycleResult {
    if (typeof input?.round === "number") this.tick(input.round);
    this.observe();
    const health = this.monitor();
    const issue = this.introspect();
    this.metacognize();
    this.reflect();
    const control = this.metacontrol();
    this.lastPhase = "ACTION";
    return {
      health,
      issue,
      phase: "ACTION",
      ...control,
      complete: false,
      public: this.publicSnapshot()
    };
  }

  compactPrompt(): string {
    const s = this.state;
    return JSON.stringify({
      active_goal: s.active_goal,
      current_plan: s.current_plan,
      current_step: s.current_step,
      completed_steps: s.completed_steps,
      pending_steps: s.pending_steps,
      current_strategy: s.current_strategy,
      alternative_strategies: s.alternative_strategies,
      available_tools: s.available_tools,
      tool_status: s.tool_status,
      previous_tool_results: s.previous_tool_results.map((r) => ({ name: r.name, ok: r.ok, preview: r.preview.slice(0, 180) })),
      errors: s.errors.slice(-4),
      warnings: s.warnings.slice(-4),
      blockers: s.blockers,
      known_facts: s.known_facts.map((f) => ({ claim: f.claim, status: f.status })),
      assumptions: s.assumptions.map((f) => ({ claim: f.claim, status: f.status })),
      unknowns: s.unknowns.map((f) => ({ claim: f.claim, status: f.status })),
      progress: s.progress,
      confidence: s.confidence,
      expected_outcome: s.expected_outcome,
      observed_outcome: s.observed_outcome,
      remaining_budget: s.remaining_budget,
      health: this.lastHealth,
      issue: this.lastIssue
    });
  }
}
