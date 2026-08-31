import { NextResponse } from "next/server";
import { listDevSkillCategories, searchDevSkills } from "@/lib/claw/dev-skills";

export const runtime = "nodejs";

// Claw "starter" prompt suggestions. Each suggestion is grounded in
// the dev-skills RAG: it shows the operator (a) what Claw can do
// (the tool surface) and (b) what kind of question the corpus can
// answer (the four categories + a few hand-picked concrete questions
// per category, drawn from real records in dev-skills.ts).
//
// The component reads this on first load (no auth — these are
// generic prompt starters, nothing operator-specific). The RAG-driven
// approach means a new skill record added to dev-skills.ts can show
// up as a suggestion the next time the operator opens the chat.
//
// The dev-skills corpus is small enough to walk every time; we sample
// deterministically (by record order) so the suggestions are stable
// across reloads and don't churn.
const SKILL_QUESTION_HINTS: Record<string, string[]> = {
  language: [
    "Show me the right pattern for a TypeScript discriminated union with exhaustive narrowing.",
    "What's the safe way to escape a single quote in a SQLite LIKE clause?",
    "How do I write a Python async function with a timeout and proper cancellation?",
    "Show me the Rust borrow-checker escape hatches for a self-referential struct."
  ],
  framework: [
    "How do Next.js App Router route handlers get the request body and the URL params?",
    "What's the right way to share a DB connection across an Express route and a worker?",
    "Show me the FastAPI dependency-injection pattern for the current user + a db pool.",
    "Write me a multi-stage Dockerfile for a Next.js 15 standalone app."
  ],
  infra: [
    "How do I wire up Postgres streaming replication with a 0-RPO synchronous primary?",
    "What's the right Redis pattern for a per-API-key sliding-window rate limit?",
    "Show me the OAuth2 authorization-code-with-PKCE flow end to end.",
    "How do I set up Prometheus + Grafana to alert on SLO burn rate?"
  ],
  pattern: [
    "Walk me through expand-contract for a zero-downtime column add + backfill.",
    "What's the right cache-invalidation strategy for a user-profile endpoint?",
    "How do I make a POST handler safely idempotent for payment retries?",
    "Give me the OWASP top-10 checklist with the specific header + code fix for each."
  ]
};

const TOOL_SUGGESTIONS: Array<{ label: string; prompt: string }> = [
  {
    label: "Research a public URL with Steel",
    prompt: "Use steel_scrape on https://caseclosedfl.com and give me a 5-bullet summary of what the operator's site says about their PI practice."
  },
  {
    label: "Search Composio toolkits",
    prompt: "Call composio_health, list every connected toolkit, and pick one I haven't used yet that I could call right now via composio_action."
  },
  {
    label: "Search the dev skills RAG",
    prompt: "Use dev_search to find the three most relevant records for 'idempotent webhook handler' and paste them inline."
  },
  {
    label: "Find a skill by id",
    prompt: "Call dev_skill_get for 'sql.like-escape' and show me the body verbatim so I can copy the char(39) trick."
  },
  {
    label: "List the dev skills catalog",
    prompt: "Run dev_skill_list so I can browse the RAG and pick a record to drill into."
  },
  {
    label: "Walk a repo upload",
    prompt: "Call repo_read_tree to list every file I've uploaded, then read_file on the largest one and summarize what it does."
  }
];

export async function GET() {
  const categories = listDevSkillCategories();
  const suggestions: Array<{ label: string; prompt: string; source: "tool" | "rag" | "category"; category?: string; skillIds?: string[] }> = [];
  // Tool-driven prompts first — these exercise real Claw tools.
  for (const t of TOOL_SUGGESTIONS) {
    suggestions.push({ label: t.label, prompt: t.prompt, source: "tool" });
  }
  // RAG-driven prompts: pick the top 1-2 records per category and
  // turn them into "ask me about X" starters. The skill id is
  // included so the component can show a subtle "RAG" badge.
  for (const cat of categories) {
    const ids = SKILL_QUESTION_HINTS[cat.category] || [];
    const topSkills = searchDevSkills("", { category: cat.category, limit: ids.length || 2 });
    for (let i = 0; i < (ids.length || 2) && i < topSkills.length; i++) {
      const skill = topSkills[i];
      const hint = ids[i] || `Show me what you know about ${skill.summary.toLowerCase()}.`;
      suggestions.push({
        label: hint,
        prompt: `Search the dev-skills RAG for "${skill.summary.toLowerCase()}" and answer using the matching record. Call dev_skill_get('${skill.id}') first, then answer in plain English.`,
        source: "rag",
        category: cat.category,
        skillIds: [skill.id]
      });
    }
  }
  return NextResponse.json({ ok: true, suggestions });
}
