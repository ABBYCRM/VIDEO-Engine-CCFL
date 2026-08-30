// lib/aion/audit.ts
//
// Heuristic audit of the assistant's emitted text against the structured
// tool outcomes of the same turn. Honest about being a heuristic — anything
// more rigorous would require comparing the model's text against the
// structured payload fields, which is a separate (and harder) problem.
//
// The audit is intentionally narrow:
//   - FAILED_TOOL_DESCRIBED_AS_SUCCESS: a tool failed in this turn AND the
//     model's emitted text claims success. This is the only check that
//     has a sharp false-positive rate low enough to act on.

export type AuditFlag = {
  severity: "HIGH" | "MEDIUM" | "LOW";
  code: string;
  detail: string;
};

export type AuditResult = {
  passed: boolean;
  kind: "HEURISTIC";
  flags: AuditFlag[];
};

const CLAIM_SUCCESS_RE =
  /\b(successfully|completed|published|posted|sent|deleted|scheduled|done|finished|ready)\b/i;

export function auditAssistantResponse(
  text: string,
  outcomes: Array<{ name: string; ok: boolean; error?: string }>
): AuditResult {
  const flags: AuditFlag[] = [];
  const failed = outcomes.filter((o) => !o.ok);
  const claimsSuccess = CLAIM_SUCCESS_RE.test(text);

  if (failed.length > 0 && claimsSuccess) {
    flags.push({
      severity: "HIGH",
      code: "FAILED_TOOL_DESCRIBED_AS_SUCCESS",
      detail: `Tool(s) ${failed.map((f) => f.name).join(", ")} failed in this turn but the assistant text claims success.`
    });
  }

  // FAILED_TOOL_IGNORED: a tool failed but the assistant moved on without
  // mentioning it. Conservative: only flag if there's at least one failed
  // tool and the failed tool's name doesn't appear anywhere in the text.
  if (failed.length > 0) {
    const lower = text.toLowerCase();
    const silentFailures = failed.filter(
      (f) => !lower.includes(f.name.toLowerCase())
    );
    if (silentFailures.length > 0) {
      flags.push({
        severity: "MEDIUM",
        code: "FAILED_TOOL_IGNORED",
        detail: `Tool(s) ${silentFailures.map((f) => f.name).join(", ")} failed but the assistant text does not mention them.`
      });
    }
  }

  return {
    passed: flags.length === 0,
    kind: "HEURISTIC",
    flags
  };
}
