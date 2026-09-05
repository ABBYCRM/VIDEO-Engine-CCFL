// Runtime-owned evidence. Model prose is never a passing check.
export type Check = { id: string; description: string; kind: "artifact" | "command" | "browser" };
export type Evidence = { id: string; tool: string; revision: number; ok: boolean; result: unknown };
export class Execution {
  private requiredKinds: Check["kind"][];
  constructor(requiredKinds: Check["kind"][] = []) { this.requiredKinds = requiredKinds; }
  goal = "";
  steps: string[] = [];
  checks: Check[] = [];
  revision = 0;
  evidence: Evidence[] = [];
  passed = new Map<string, { evidence: string; revision: number }>();

  plan(args: Record<string, unknown>) {
    if (this.goal) throw new Error("Plan already recorded; do not remove acceptance criteria to bypass failures.");
    if (typeof args.goal !== "string" || !args.goal.trim() || !Array.isArray(args.steps) || !args.steps.length || !args.steps.every(s => typeof s === "string") || !Array.isArray(args.checks) || !args.checks.length || args.checks.length > 20) throw new Error("Provide goal, steps, and 1–20 acceptance checks.");
    const checks = args.checks as Check[];
    if (checks.some(c => !c || typeof c.id !== "string" || !c.id || typeof c.description !== "string" || !c.description || !["artifact", "command", "browser"].includes(c.kind)) || new Set(checks.map(c => c.id)).size !== checks.length) throw new Error("Checks require unique IDs, descriptions and artifact/command/browser kinds.");
    if (this.requiredKinds.some(kind => !checks.some(c => c.kind === kind))) throw new Error(`This task requires these check kinds: ${this.requiredKinds.join(", ")}. Missing tools must be reported as blockers, not removed criteria.`);
    this.goal = args.goal;
    this.steps = args.steps as string[];
    this.checks = checks;
    return this.snapshot();
  }

  begin(tool: string) {
    // Unknown tools may mutate state. Invalidate before dispatch, including failures.
    if (!READ_ONLY.has(tool)) { this.revision++; this.passed.clear(); }
  }

  record(tool: string, result: unknown): Evidence {
    const evidence = { id: `e${this.evidence.length + 1}`, tool, revision: this.revision, ok: toolSucceeded(result), result };
    this.evidence.push(evidence);
    return evidence;
  }

  verify(args: Record<string, unknown>) {
    const check = this.checks.find(c => c.id === args.check);
    const evidence = this.evidence.find(e => e.id === args.evidence);
    if (!check || !evidence || !evidence.ok || evidence.revision !== this.revision) throw new Error("Check needs successful, current-revision tool evidence.");
    // Artifact content and model consultations cannot certify execution.
    if (check.kind === "artifact") {
      if (!["save_file", "read_file"].includes(evidence.tool)) throw new Error("Artifact checks require saved/read file evidence.");
      const r = evidence.result as Record<string, unknown>;
      if (typeof r.id !== "string" || typeof r.size !== "number" || r.size <= 0) throw new Error("Artifact is missing or empty.");
    } else {
      if (!["composio_action", "aion_action"].includes(evidence.tool)) throw new Error("Execution checks require execution-tool results, not model text or saved files.");
      if (typeof args.path !== "string" || !args.path || args.path.split('.').some(p => ["__proto__", "constructor", "prototype"].includes(p))) throw new Error("Provide the exact result path to the execution exit code or browser assertion.");
      const leaf = args.path.split('.').at(-1)!;
      if (check.kind === "command" && !["exitCode", "exit_code"].includes(leaf)) throw new Error("Command evidence must expose exitCode or exit_code.");
      if (check.kind === "browser" && !["passed", "success"].includes(leaf)) throw new Error("Browser evidence must expose a passed or success assertion.");
      const actual = args.path.split('.').reduce<unknown>((v, key) => {
        if (typeof v === "string") { try { v = JSON.parse(v); } catch { return undefined; } }
        return v !== null && typeof v === "object" && Object.hasOwn(v, key) ? (v as Record<string, unknown>)[key] : undefined;
      }, evidence.result);
      const expected = check.kind === "command" ? 0 : true;
      if (actual !== expected) throw new Error(`Verification failed: expected ${JSON.stringify(expected)}, observed ${JSON.stringify(actual) ?? "missing"}. Correct the failure and run the check again.`);
    }
    this.passed.set(check.id, { evidence: evidence.id, revision: this.revision });
    return this.snapshot();
  }

  get verified() { return this.checks.length > 0 && this.checks.every(c => this.passed.get(c.id)?.revision === this.revision); }
  snapshot() {
    return { goal: this.goal, steps: this.steps, revision: this.revision, verified: this.verified, checks: this.checks.map(c => ({ ...c, evidence: this.passed.get(c.id)?.evidence ?? null, passed: this.passed.get(c.id)?.revision === this.revision })) };
  }
  report(reason: string) {
    return `Status: ${this.verified ? "verified checks" : this.passed.size ? "partially verified" : "blocked / unverified"}. ${reason}\n` + this.checks.map(c => `- ${this.passed.has(c.id) ? "PASS" : "NOT VERIFIED"}: ${c.description}${this.passed.has(c.id) ? ` (${this.passed.get(c.id)!.evidence})` : ""}`).join("\n");
  }
}
const READ_ONLY = new Set(["read_file", "list_files", "repo_tree", "dev_search", "dev_skill_get", "dev_categories", "app_status", "composio_health", "composio_tool_schema", "steel_scrape", "web_search", "web_screenshot", "analyze_image"]);
export function toolSucceeded(value: unknown): boolean {
  if (!value || typeof value !== "object") return true;
  const r = value as Record<string, unknown>;
  if (r.ok === false || r.successful === false || r.success === false || r.isError === true || r.error) return false;
  return r.data && typeof r.data === "object" ? toolSucceeded(r.data) : true;
}
export function parseToolCalls(text: string) {
  const re = /<tool_call\s+name="([a-zA-Z0-9_]+)">([\s\S]*?)<\/tool_call>/gi;
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const args: unknown = JSON.parse(match[2]);
    if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("Tool arguments must be a JSON object.");
    calls.push({ name: match[1], args: args as Record<string, unknown> });
  }
  if (text.replace(re, "").toLowerCase().includes("<tool_call")) throw new Error("Incomplete or malformed tool call. No calls from this response were executed.");
  return calls;
}

export async function awaitWithSignal<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  let onAbort!: () => void;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal.reason ?? new Error("Execution interrupted; inspect the operation before retrying."));
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  });
  try { return await Promise.race([operation, aborted]); }
  finally { signal.removeEventListener("abort", onAbort); }
}
