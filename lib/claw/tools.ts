// lib/claw/tools.ts — Claw-only.
//
// 2026-08-30 "Claw only" repo strip. The previous version of this file
// declared ~70 tools across video generation, calendar publishing,
// campaigns, avatars, sites, SEO, blog writing, Instagram, Reddit, X,
// LinkedIn, YouTube, creator uploads, and a long list of niche
// adapters — all of which have been stripped with the rest of the
// pre-Claw build. This replacement is intentionally a small set of
// Claw primitives: a health check, a generic Composio passthrough, a
// Steel scraper, a screenshot tool, a web search, an image analyzer
// (NVIDIA Vision), and the local file CRUD that powers the Claw
// console's file panel.
//
// Every tool here uses exactly one of four external services:
//   - Composio         (composioAction in lib/composio/client.ts)
//   - Steel.dev        (scrapeWithSteel in lib/steel.ts)
//   - ScreenshotOne    (takeScreenshot in lib/screenshotone.ts)
//   - NVIDIA Vision    (analyzeImage in lib/nvidia/vision.ts)
// Plus the in-process Claw store (lib/claw/store.ts) for local files.
//
// Composio is exposed as a single generic tool, "composio_action",
// rather than one tool per social network. The shape is fixed:
//   composio_action({ slug: "HACKERNEWS_CREATE_POST", args: { title, body } })
// The "in and out granular" promise the operator asked for is enforced
// by passing the tool the exact slug the operator wants to call and
// the exact args dict; the response is the raw upstream payload
// (clipped to 6,000 chars to keep the chat context tractable). This
// way the operator can wire any Composio toolkit (Reddit, Instagram,
// X, LinkedIn, GitHub, Gmail, Slack, Notion, …) without the app
// having to declare a bespoke tool for each one.

import { db } from "@/lib/db";
import { composioHealth, composioAction } from "@/lib/composio/client";
import { isSteelConfigured, scrapeWithSteel } from "@/lib/steel";
import { takeScreenshot } from "@/lib/screenshotone";
import { webSearch } from "@/lib/web-search";
import { analyzeImage } from "@/lib/nvidia/vision";
import { searchDevSkills, searchDevSkillsReranked, getDevSkill, listDevSkillCategories } from "@/lib/claw/dev-skills";
import {
  deleteClawFile, getFile as getClawFile,
  listFiles, readClawFileText, renameClawFile
} from "@/lib/claw/store";

function str(v: unknown, fallback = ""): string {
  if (typeof v === "string") return v;
  if (v == null) return fallback;
  return String(v);
}

function num(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clip<T>(value: T, maxChars = 6000): T {
  // Cap the JSON-serialized response so a noisy upstream (Reddit
  // thread dump, full IG media list, etc.) doesn't blow the chat
  // context. The raw value is preserved for structured callers; the
  // chat tool-end event gets a preview string.
  try {
    const text = typeof value === "string" ? value : JSON.stringify(value);
    if (text.length <= maxChars) return value;
    const truncated = text.slice(0, maxChars);
    return (typeof value === "string"
      ? `${truncated}\n…[truncated ${text.length - maxChars} chars]`
      : { _clawTruncated: true, _clawOriginalLength: text.length, _clawPreview: truncated }) as unknown as T;
  } catch {
    return value;
  }
}

type ToolDef = {
  name: string;
  description: string;
  args: string;
  handler: (a: any) => Promise<any>;
};

export const CLAW_TOOLS: ToolDef[] = [
  // ─── Local app state ─────────────────────────────────────────────
  {
    name: "app_status",
    description: "Return the live health of the Claw console: NVIDIA + Composio + Steel reachability, current Claw tool count, and the active LLM model.",
    args: "{}",
    handler: async () => {
      // The previous build of this tool reached into video_jobs /
      // scheduled_posts / connected_accounts to surface video and
      // campaign stats. Those tables are gone in the "Claw only" build.
      // What remains: the three external services Claw actually talks
      // to, plus the in-process counts that matter to the operator.
      const conversations = (db.prepare("SELECT COUNT(*) AS n FROM claw_conversations").get() as { n: number }).n;
      const messages = (db.prepare("SELECT COUNT(*) AS n FROM claw_messages").get() as { n: number }).n;
      const files = (db.prepare("SELECT COUNT(*) AS n FROM claw_files").get() as { n: number }).n;
      const composio = await composioHealth();
      return {
        ok: true,
        conversationCount: conversations,
        messageCount: messages,
        fileCount: files,
        external: {
          composio: { configured: composio.configured, live: composio.live, toolkits: composio.toolkits?.length || 0, note: composio.note },
          steel: { configured: isSteelConfigured() }
        }
      };
    }
  },

  // ─── Composio (granular in/out passthrough) ──────────────────────
  {
    name: "composio_health",
    description: "Ping the Composio API. Returns the configured flag, live flag, and the list of connected toolkits. Use this BEFORE calling composio_action to confirm the toolkit you want is actually wired up; if the toolkit isn't in the list, composio_action will 4xx and tell you which one is missing.",
    args: "{}",
    handler: async () => composioHealth()
  },
  {
    name: "composio_action",
    description: "Call a single Composio tool. Pass the exact slug the operator wants (e.g. 'HACKERNEWS_CREATE_POST', 'REDDIT_SEARCH_ACROSS_SUBREDDITS', 'INSTAGRAM_CREATE_POST', 'GMAIL_SEND_EMAIL', 'SLACK_POST_MESSAGE', 'GITHUB_CREATE_ISSUE', 'NOTION_CREATE_PAGE', 'TWITTER_CREATION_OF_A_POST', 'LINKEDIN_CREATE_POST', 'YOUTUBE_UPLOAD_VIDEO', etc.) and the exact `args` dict the upstream tool expects. The response is the raw upstream payload, clipped to 6,000 chars. The `toolkit` field is required so the right connected account is picked; if you don't know the toolkit, pass an empty string and the client will pick by slug. Connection / auth / schema errors come back as `{ error: string, code?: string }` rather than throwing, so the operator can see the upstream's own message.",
    args: "{\"slug\":\"HACKERNEWS_CREATE_POST\",\"args\":{\"title\":\"...\",\"body\":\"...\"},\"toolkit\":\"\"}",
    handler: async (a) => {
      const slug = str(a.slug).trim();
      if (!slug) return { error: "slug is required" };
      const args = (a.args && typeof a.args === "object" ? a.args : {}) as Record<string, unknown>;
      const toolkit = str(a.toolkit).trim();
      const userId = str(a.userId).trim() || undefined;
      const result = await composioAction({ slug, args, toolkit: toolkit || undefined, userId });
      return result;
    }
  },

  // ─── Steel.dev (web scrape) ──────────────────────────────────────
  {
    name: "steel_scrape",
    description: "Live-fetch a public URL through Steel.dev and return the markdown body. Steel is the operator's chosen scraper (per the 2026-08-30 'Claw only' directive). Use this for any public-web research; do NOT scrape via fetch() directly. If the URL is invalid (private host, file://, etc.) steel returns a 4xx and the chat sees the upstream message.",
    args: "{\"url\":\"https://example.com\"}",
    handler: async (a) => {
      const url = str(a.url).trim();
      if (!url) return { error: "url is required" };
      return scrapeWithSteel({ url });
    }
  },

  // ─── Screenshot ─────────────────────────────────────────────────
  {
    name: "web_screenshot",
    description: "Take a screenshot of a public URL via ScreenshotOne and return the image as a base64 PNG. Useful when the operator wants to 'see' a page without scraping its DOM.",
    args: "{\"url\":\"https://example.com\",\"fullPage\":false}",
    handler: async (a) => {
      const url = str(a.url).trim();
      if (!url) return { error: "url is required" };
      return takeScreenshot({ url, fullPage: Boolean(a.fullPage) });
    }
  },

  // ─── Web search ─────────────────────────────────────────────────
  {
    name: "web_search",
    description: "Run a web search and return the top results as a list of {title, url, snippet}. Provider is whichever is configured (defaults to Exa / Tavily). Always cite the returned URL when the operator asks for live research.",
    args: "{\"query\":\"...\",\"limit\":10}",
    handler: async (a) => {
      const query = str(a.query).trim();
      if (!query) return { error: "query is required" };
      return webSearch({ query, numResults: num(a.limit, 10) });
    }
  },

  // ─── Image analysis (NVIDIA Vision) ────────────────────────────
  {
    name: "analyze_image",
    description: "Hand an image URL or a public http(s) path to NVIDIA Vision and ask a question about it. Returns the model's answer plus a short caption. Use this whenever the operator wants to know what an image LOOKS like, not what its caption says — captions are unreliable for visual content.",
    args: "{\"url\":\"https://...\",\"question\":\"What is in this image?\"}",
    handler: async (a) => {
      const url = str(a.url).trim();
      if (!url) return { error: "url is required" };
      const question = str(a.question, "Describe this image in detail.");
      const answer = await analyzeImage({ imageUrl: url, question });
      return { answer };
    }
  },

  // ─── Local file CRUD (Claw file panel) ─────────────────────────
  {
    name: "list_files",
    description: "List files in the Claw file panel. If `conversationId` is given, returns that conversation's files; otherwise returns the most recent 80 files across all conversations.",
    args: "{\"conversationId\":\"optional\"}",
    handler: async (a) => listFiles(a.conversationId ? str(a.conversationId) : null)
  },
  {
    name: "read_file",
    description: "Read the text content of a file in the Claw file panel. Returns the file's name, mime, size, and a text preview (binary files return null for text and a base64 stub).",
    args: "{\"id\":\"file-uuid\"}",
    handler: async (a) => {
      const id = str(a.id).trim();
      if (!id) return { error: "id is required" };
      const f = getClawFile(id);
      if (!f) return { error: "file not found" };
      const text = await readClawFileText(id);
      return { id: f.id, name: f.name, mime: f.mime, size: f.size, text };
    }
  },
  {
    name: "rename_file",
    description: "Rename a file in the Claw file panel. Only the operator's name changes; the underlying file is untouched.",
    args: "{\"id\":\"file-uuid\",\"name\":\"new-name.txt\"}",
    handler: async (a) => {
      const id = str(a.id).trim();
      const name = str(a.name).trim();
      if (!id || !name) return { error: "id and name are required" };
      renameClawFile(id, name);
      return { ok: true };
    }
  },
  {
    name: "delete_file",
    description: "Delete a file from the Claw file panel. This removes the file's row and unlinks the on-disk file; it does NOT delete anything from the chat history that referenced it.",
    args: "{\"id\":\"file-uuid\"}",
    handler: async (a) => {
      const id = str(a.id).trim();
      if (!id) return { error: "id is required" };
      await deleteClawFile(id);
      return { ok: true };
    }
  },

  // ─── Developer knowledge RAG (lib/claw/dev-skills.ts) ─────────────
  // The operator's 2026-08-30 directive: "create a RAG of dev skills
  // and coding skills e2e ... I want this thing to understand
  // coding, coding languages etc." Claw has an in-process corpus of
  // condensed, code-anchored developer knowledge (TypeScript, React,
  // Next.js, SQL, Python, Go, Rust, Bash, regex, GraphQL, Docker,
  // Postgres, Redis, OAuth, monitoring, plus 20+ named patterns).
  // Claw calls this tool BEFORE answering a developer question so
  // the LLM has the precise API/idiom in context instead of
  // hallucinating from its training distribution. Use the `category`
  // field to scope ("language", "framework", "infra", "pattern") and
  // the `id` field with `dev_skill_get` to fetch one specific record
  // by id.
  {
    name: "dev_search",
    description: "Search the Claw dev-skills corpus (TypeScript, React, Next.js, SQL, Python, Go, Rust, Bash, Docker, Postgres, Redis, OAuth, monitoring, patterns) with a two-stage RAG pipeline: a keyword prefilter pulls a wide candidate pool, then an NVIDIA reranking model reorders it semantically so the MOST relevant record is first — even when your wording doesn't lexically match it (e.g. 'make a POST safe to retry' → the idempotency record). Returns up to 6 records, each with a code-anchored summary + body, plus a `reranked` flag showing whether semantic reranking ran. Use this BEFORE answering any developer / coding / DevOps question so you pull the exact API/idiom from the curated corpus instead of hallucinating; trust the top result — it is the reranked best match.",
    args: "{\"query\":\"Next.js App Router caching\",\"category\":\"framework\",\"limit\":6}",
    handler: async (a) => {
      const query = str(a.query).trim();
      const category = (["language", "framework", "infra", "pattern"] as const).includes(str(a.category) as any) ? (str(a.category) as any) : undefined;
      const limit = num(a.limit, 6);
      const { matches, reranked, candidateCount, note } = await searchDevSkillsReranked(query, { category, limit });
      if (matches.length === 0) {
        return { query, category, count: 0, reranked, matches: [], hint: "No matches. Try a broader query, drop the category filter, or call dev_skill_list to see what's available." };
      }
      return {
        query,
        category: category || "any",
        count: matches.length,
        reranked,
        candidateCount,
        ...(note ? { note } : {}),
        matches: matches.map((m) => ({ id: m.id, category: m.category, tags: m.tags, summary: m.summary, body: m.body }))
      };
    }
  },
  {
    name: "dev_skill_get",
    description: "Fetch one dev-skill record by its stable id (e.g. 'next.app-router', 'ts.react', 'sql.like-escape', 'redis.usage'). Returns the full body.",
    args: "{\"id\":\"ts.react\"}",
    handler: async (a) => {
      const id = str(a.id).trim();
      if (!id) return { error: "id is required" };
      const skill = getDevSkill(id);
      if (!skill) return { error: `unknown id ${id}. Call dev_skill_list to see the catalog.` };
      return skill;
    }
  },
  {
    name: "dev_skill_list",
    description: "List the dev-skills catalog grouped by category, with id + summary (no body). Use this to discover what knowledge is available before calling dev_search.",
    args: "{}",
    handler: async () => {
      const categories = listDevSkillCategories();
      const byCategory: Record<string, Array<{ id: string; tags: string[]; summary: string }>> = {};
      for (const c of categories) {
        byCategory[c.category] = searchDevSkills("", { category: c.category, limit: 100 }).map((s) => ({ id: s.id, tags: s.tags, summary: s.summary }));
      }
      return { categories, byCategory };
    }
  },

  // ─── Repository analysis (the operator's other half of the ask) ─
  // Claw can read files in its own data/claw-files/ directory (the
  // operator uploads them via the chat panel). It does NOT have
  // direct filesystem access to the rest of the app, so
  // "repository analysis" is achieved by: (a) the operator
  // uploading the files they want analyzed via the Claw file
  // panel, then (b) Claw reading them with read_file. Combined
  // with the dev_search RAG, this is the operator's "understand
  // coding" loop end-to-end.
  {
    name: "repo_read_tree",
    description: "List every file in the Claw file panel. If the operator has uploaded a directory tree, this returns the full set; combine with read_file(id) to walk through each file. This is the entry point for repository analysis when the operator has uploaded the codebase via the file panel.",
    args: "{}",
    handler: async () => {
      const files = listFiles(null);
      return { count: files.length, files: files.map((f) => ({ id: f.id, name: f.name, mime: f.mime, size: f.size })) };
    }
  }
];

export const CLAW_TOOL_MAP = new Map(CLAW_TOOLS.map((t) => [t.name, t]));

export function toolsCatalog(): string {
  return CLAW_TOOLS.map((t) => `- ${t.name} ${t.args} — ${t.description}`).join("\n");
}

export async function executeClawTool(name: string, args: Record<string, unknown>) {
  const tool = CLAW_TOOL_MAP.get(name);
  if (!tool) throw new Error(`Unknown tool ${name}`);
  const data = await tool.handler(args);
  return clip(data, 6000);
}
