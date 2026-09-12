import { CURSOR_DEFAULT_REPO } from "./types";

export function normalizeGithubRepo(raw: string | undefined, fallback = CURSOR_DEFAULT_REPO): { ok: true; url: string } | { ok: false; error: string } {
  const input = String(raw || "").trim() || fallback;
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return { ok: false, error: "repo must be an https GitHub URL (e.g. https://github.com/org/repo)" };
  }
  if (parsed.protocol !== "https:") return { ok: false, error: "repo must use https" };
  if (parsed.hostname !== "github.com" && parsed.hostname !== "www.github.com") {
    return { ok: false, error: "repo must be a github.com URL" };
  }
  const parts = parsed.pathname.replace(/\.git$/i, "").split("/").filter(Boolean);
  if (parts.length < 2) return { ok: false, error: "repo URL must be https://github.com/<owner>/<repo>" };
  if (parts.some((p) => p === ".." || p.includes(":"))) return { ok: false, error: "repo path is invalid" };
  return { ok: true, url: `https://github.com/${parts[0]}/${parts[1]}` };
}

export function criteriaList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((x) => String(x).trim()).filter(Boolean).slice(0, 12);
  if (typeof raw === "string" && raw.trim()) {
    return raw.split(/\n|;/).map((s) => s.replace(/^[-*]\s*/, "").trim()).filter(Boolean).slice(0, 12);
  }
  return [];
}

/** Compile a Grok-Bot-style brief: goal + repo + success criteria + evidence rules. */
export function buildCursorBrief(input: {
  goal: string;
  repo?: string;
  context?: string;
  successCriteria?: unknown;
}): string {
  const goal = String(input.goal || "").trim();
  const criteria = criteriaList(input.successCriteria);
  const lines = [
    goal,
    input.context ? `Context:\n${String(input.context).trim()}` : "",
    input.repo ? `Repository: ${input.repo}` : "",
    criteria.length
      ? `Success criteria:\n${criteria.map((c) => `- ${c}`).join("\n")}`
      : "Success criteria:\n- Implement the requested change end-to-end\n- Prove it with tests or a scripted call\n- Return files changed and command outcomes",
    `Evidence rules (Grok Bot / VIDEO-Engine-CCFL):
- Dynamic on-the-spot work. Do not pick from a prefab agent menu.
- Prefer methodical-notes/<date>-<slug> branches for this repo's audit work when the operator did not name another branch.
- No stubs, no fake completions, no hallucinated files, test results, or API responses.
- Never ask the operator to fix code you can fix.
- Return evidence: paths changed, commands run, outcomes. Execution over explanation.`,
  ];
  return lines.filter(Boolean).join("\n\n");
}
