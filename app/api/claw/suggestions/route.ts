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

// Creative ads prompt — injected into the suggestions list with source="creative".
// The component intercepts this special source type and shows a URL-input modal
// before sending the full brief to the chat.  (The component holds its own copy
// of the prompt template so it can substitute the URL at launch time.)
const CREATIVE_ADS_PROMPT_TEMPLATE = (url: string) => `You are an elite direct-response advertiser, short-form video strategist, and narrative scriptwriter.

Your job is to turn my product, service, idea, story, or offer into an attention-retaining ad/video script that makes the viewer feel compelled to discover what happens next.

INPUT

Product/Topic: [INSERT]
Target Audience: [INSERT]
Desired Action: [BUY / SIGN UP / FOLLOW / WATCH / CLICK / ETC.]
Platform: [TikTok / Instagram Reels / YouTube Shorts / YouTube / Meta Ad]
Video Length: [15 sec / 30 sec / 60 sec / 3 min / etc.]
Tone: [INSERT]
Important Facts/Proof: [INSERT]
Offer: [INSERT, if applicable]

CORE STORYTELLING SYSTEM

Build the script around a continuous curiosity loop:

SETUP → QUESTION → PARTIAL ANSWER → NEW QUESTION → ESCALATION → PAYOFF

The viewer should repeatedly receive enough information to stay satisfied but not enough to feel that the story is finished.

Use the following techniques.

1. OPEN LOOPS

Introduce unanswered questions early.

Do NOT immediately explain everything.

Every time one question is answered, introduce or imply another question.

Example structure:

"This company was about to go bankrupt..."
→ Why?

"Then they changed one tiny thing..."
→ What thing?

"It generated $4 million..."
→ How?

"But that wasn't the crazy part..."
→ What happened next?

Maintain at least one active curiosity loop throughout most of the video.

2. THE BIG QUESTION

Create ONE central question that drives the entire video.

Examples:

"Can this $20 product actually outperform the $500 version?"

"How did a company nobody knew become a $100M brand?"

"Why are thousands of people suddenly switching to this?"

"Can I turn $100 into $10,000 in 30 days?"

Do not fully answer the Big Question until near the climax.

3. STAKES

The story needs:

A CHARACTER:
Someone the audience can understand, identify with, root for, or root against.

SOMETHING AT RISK:
Money, time, reputation, opportunity, convenience, status, failure, frustration, losing something valuable, etc.

URGENCY:
Explain why the outcome matters NOW.

Make the consequences concrete rather than vague.

Weak:
"This was important."

Strong:
"If this didn't work by Friday, they would lose the biggest customer keeping the company alive."

4. CONTRAST

Create strong before/after, expectation/reality, normal/extreme, expensive/cheap, easy/hard, success/failure, or old/new contrasts.

Use contrast visually AND verbally.

Examples:

"Everyone else was spending $10,000. He spent $47."

"Yesterday: 83 followers.
30 days later: 100,000."

"I expected this to completely fail.
Then this happened."

Contrast should make the transformation immediately understandable.

5. INFORMATION GAPS

Deliberately separate information the viewer currently knows from information they WANT to know.

Ask:

What does the viewer know right now?
What do they desperately want to know next?

Reveal information in the order that maximizes curiosity rather than chronological order.

Do not reveal B simply because B happened after A.

Reveal B when B produces the strongest desire to discover C.

6. QUESTION CHAINS

Build a chain of implied questions.

For every section, identify:

ANSWER GIVEN:
What did we just reveal?

NEXT QUESTION:
What question does that revelation naturally create?

Example:

"He started with $100."
→ What did he buy?

"He bought something nobody wanted."
→ Why would he do that?

"Because he discovered one unusual loophole."
→ What loophole?

"It worked."
→ How much did he make?

"He made $8,400."
→ Can it be repeated?

The script should feel like climbing a staircase where every step reveals another step.

7. PATTERN INTERRUPTS

Every few seconds, change something:

Visual
Camera angle
Graphic
Screenshot
Headline
Sound
Pacing
Question
Example
Story beat
Number/statistic
Before/after
Demonstration

Do not let the presentation remain visually or conceptually static for too long.

8. ESCALATION

Each beat should ideally become MORE interesting than the previous beat.

Use:

Interesting
→ surprising
→ consequential
→ unexpected
→ highest-stakes moment
→ payoff

Avoid putting the strongest revelation too early unless it creates an even larger mystery.

9. THE HEADFAKE

When appropriate, make the viewer believe the story is heading toward an obvious conclusion, then reveal a credible reversal.

Structure:

Expectation → evidence supporting expectation → reversal → explanation.

Example:

"So obviously, the expensive version won.

Except...

it didn't."

The reversal must be genuine and supported by the facts. Never fabricate a twist just for retention.

10. VISUAL STORYTELLING

Do not merely write dialogue.

For EVERY beat, provide:

VOICEOVER / DIALOGUE
ON-SCREEN TEXT
VISUAL
EDIT / TRANSITION
CURIOSITY PURPOSE

Favor showing evidence over merely making claims.

Use things like:

screenshots
graphs
comparisons
demonstrations
comments
reviews
before/after shots
timers
numbers
documents
UI
product closeups
reaction shots
animated diagrams

11. HOOK

The first 1–3 seconds must create:

SPECIFICITY + CURIOSITY + CONSEQUENCE

Avoid generic hooks such as:

"You won't believe this..."
"Did you know..."
"Here are three tips..."
"Stop scrolling..."

Prefer concrete hooks:

"I spent $2,000 testing the five most popular versions of this so you don't have to."

"This company increased sales 317% by removing one thing from its website."

"I gave myself seven days to prove whether this actually works."

The hook should create a question whose answer requires continuing to watch.

12. PAYOFF

Eventually ANSWER the Big Question.

Do not create clickbait where the promised answer never arrives.

The payoff should feel proportional to the amount of anticipation created.

Then transition naturally into the CTA.

13. CTA

The CTA should feel like the logical NEXT STEP in the story rather than an advertisement suddenly interrupting it.

Instead of:

"Buy now."

Prefer structures such as:

"So if you're dealing with [problem], this is exactly what I'd try."

"If you want to test it yourself, [action]."

"That's why we built [product]."

"If you want the full version/template/system, it's [location/action]."

Do not make false scarcity, fake urgency, fake statistics, fake testimonials, or unsupported claims.

RETENTION AUDIT

After writing the first draft, analyze EVERY beat.

For each beat ask:

1. Why would someone continue watching?
2. What unanswered question exists?
3. What changed from the previous beat?
4. Did this beat increase or decrease curiosity?
5. Could I reveal less while remaining understandable?
6. Is there a stronger contrast?
7. Are the stakes clear?
8. Is the viewer being shown evidence?
9. Does this lead naturally into the next beat?

Rewrite any section where the viewer has no compelling reason to continue.

OUTPUT FORMAT

First output:

BIG QUESTION:
[central narrative question]

CHARACTER:
[who we're following]

STAKES:
[what can be gained/lost]

URGENCY:
[why the outcome matters]

CORE CONTRAST:
[A vs B]

HEADFAKE:
[expected outcome → actual outcome, if appropriate]

OPEN LOOPS:
[list the major curiosity loops]

Then produce the script as a beat-by-beat table:

TIME | VOICEOVER | ON-SCREEN TEXT | VISUAL | EDIT | QUESTION CREATED

Example:

0:00–0:03
VO: ...
TEXT: ...
VISUAL: ...
EDIT: ...
QUESTION CREATED: "..."

Continue through the entire video.

Then provide:

3 ALTERNATIVE HOOKS

A — Curiosity hook
B — Stakes hook
C — Contrarian/headfake hook

Then provide:

RETENTION MAP

For every major beat:
Question opened → information revealed → next question opened

Finally provide:

CTA
[final CTA]

THUMBNAIL / FIRST-FRAME CONCEPT
[concept]

CAPTION
[caption]

Do not sacrifice clarity for mystery.

The viewer should always understand WHAT is happening while remaining curious about WHY, HOW, or WHAT HAPPENS NEXT.

---

IMPORTANT — YOUR FIRST STEP:
Before producing the ad scripts, you MUST use steel_scrape to research the site at the following URL and extract all relevant information about the product, service, offer, audience, tone, and key selling points. Use everything you find on the page.

URL to research: ${url}

`;

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
  const suggestions: Array<{ label: string; prompt: string; source: "tool" | "rag" | "category" | "creative"; category?: string; skillIds?: string[] }> = [];
  // Tool-driven prompts first — these exercise real Claw tools.
  for (const t of TOOL_SUGGESTIONS) {
    suggestions.push({ label: t.label, prompt: t.prompt, source: "tool" });
  }
  // Creative-ads prompt: source="creative" signals the component to show a
  // URL-input modal before sending the full brief to chat.
  suggestions.push({
    label: "Create ad scripts from a URL",
    prompt: "CREATIVE_ADS_MODE",
    source: "creative"
  });
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
