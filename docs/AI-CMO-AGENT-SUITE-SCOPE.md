# Scope of Service — AI Marketing Agent Suite for VIDEO-Engine

## 0. Method and sourcing note

This document was produced by reading this repository only — its source
code, migrations, README, and `AGENTS.md` contract. The **target feature
list** (the 11 items below: Website Analysis, Strategies, SEO Agent, GEO
Agent, Influencer Agent, X/Twitter Agent, Coding Agent, Reddit Distribution
Agent, AI Content Writer Agent, LinkedIn Agent, UGC Videos Agent) is taken
verbatim from the pricing screenshot supplied with the request. No claim is
made anywhere in this document about how the third-party product in that
screenshot is actually implemented internally — that is not knowable from a
pricing page, and this document does not guess. Every implementation step
below is grounded in a real file, table, or pattern that exists in this
repository today, cited by path. Where a feature has no existing equivalent
in this codebase, that is stated explicitly rather than invented.

Everything here is a **plan**, not a diff. No product code was changed to
produce this document.

---

## 1. Current-state baseline (verified in this repo)

| Layer | What exists today | Where |
|---|---|---|
| App framework | Next.js 15 App Router, TypeScript strict, Tailwind | `next.config.ts`, `tsconfig.json` |
| Data | `better-sqlite3` primary store, optional Postgres mirror, versioned SQL migrations (currently `001`–`007`) plus feature-local `db.exec(...)` bootstrap blocks | `lib/db.ts`, `lib/db-postgres.ts`, `lib/db-pg-mirror.ts`, `migrations/*.sql` |
| Auth | Admin session cookie + `ve_live_*` hashed API tokens | `lib/auth.ts`, `lib/tokens.ts` |
| Secrets | Per-provider keys AES-256-GCM encrypted in a generic `settings` key/value table; raw keys never re-sent to the browser | `lib/crypto.ts`, `lib/settings.ts` |
| Generation providers | 4 video providers behind one contract (`veo`, `grok`, `a2e`, `hedra`), one-shot 8s job model, poll-based | `lib/providers.ts`, `lib/jobs.ts`, `AGENTS.md` |
| "Agent brain" | NVIDIA NIM chat completion (Nemotron), used by every AI-authored-content module via one client | `lib/nvidia/client.ts`, `lib/nvidia/*.ts` |
| Conversational agent | **Claw** — a single flat tool registry, each tool = `{name, description, args, handler}`, called from an LLM chat loop | `lib/claw/tools.ts`, `lib/claw/runtime.ts`, `components/claw-console.tsx` |
| Website intake | SSRF-guarded crawler (rejects localhost/private IPs, same-origin only, ≤6 pages) + NVIDIA JSON extraction into brand/SEO defaults | `lib/site-research.ts`, `lib/sites.ts` |
| Headless browsing | Steel.dev adapter for JS-heavy public pages, returns Markdown + metadata + links + optional screenshot | `lib/steel.ts` |
| Autopilot pattern | `setInterval` tick loops that claim one `pending` row at a time and process it | `lib/blog-autopilot.ts`, `lib/campaign-autopilot.ts` |
| SEO content pipeline | `sites` table (CMS, cadence, keywords, tone) → `blog_posts` table (title/slug/meta/outline/body) → autopilot generation | `lib/sites.ts`, `lib/nvidia/blog-writer.ts`, `lib/blog-autopilot.ts` |
| Content writer | Structured, multi-platform copy generation with human-edit provenance and revision history | `lib/nvidia/content-writer.ts`, `lib/nvidia/schemas.ts`, `social_content_packages` / `social_content_revisions` tables |
| Distribution — Instagram | Fully wired: Graph API primary, Composio fallback, DMs, comments, publish | `lib/instagram-graph.ts`, `lib/instagram-composio.ts`, `lib/claw/fallback.ts` |
| Distribution — YouTube | OAuth connect + upload | `lib/youtube.ts`, `app/api/oauth/youtube` |
| Distribution — everything else | **Catalog-only.** LinkedIn Pages, X/Twitter, TikTok Ads, Google Ads, Meta Ads, Google Business Profile, Slack, Notion, Discord, HubSpot, Mailchimp, Resend, S3 are *listed* on the Integrations page but have **no functional adapter and no Claw tools** | `lib/integrations/composio.ts` |
| Generic connected-account store | Already toolkit-agnostic (`toolkit`, `connected_account_id`, `user_id`, `status`) — ready to hold X/LinkedIn/Reddit connections without a schema change | `connected_accounts` table, `lib/db.ts` |
| Calendar | `scheduled_posts.network` is a free-text column — new networks (`x`, `linkedin`, `reddit`) are valid today with **zero migration** | `lib/db.ts` (scheduled_posts) |
| UGC video | Already a first-class campaign category across prompt compiler, dedicated script writer, avatars, split-screen/reaction formats, and all 4 providers | `lib/prompts.ts`, `lib/nvidia/ugc-writer.ts`, `lib/avatars.ts`, `lib/split-compose.ts` |
| **Current business-mode constraint** | Image/video generation is **deliberately disabled** by an operator directive dated 2026-08-27 ("manual-calendar mode"). Nav shows only Claw/Create/Creator/Calendar/Library/Settings; Campaigns/Avatars/Sites/Integrations/Podcast pages still exist on disk but are gated or hidden. | `lib/feature-flags.ts` (`IMAGE_GEN_ENABLED`), `components/app-shell.tsx` |
| Testing | `node --test` unit tests, Playwright e2e specs per feature | `tests/unit/*.test.ts`, `tests/e2e/*.spec.ts` |

**This baseline matters for scoping**: several "AI CMO" features are not
green-field. Website Analysis, SEO, and AI Content Writer are 60–90% built
already and mostly need exposure/branding work. Influencer and Coding
agents are genuinely new ground. X/Twitter, LinkedIn, and Reddit are a
repeatable "one more Composio adapter" pattern this repo already proves out
with Instagram.

---

## 2. Cross-cutting work (do this once, reuse for every agent below)

1. **Schema convention** — this repo uses two valid patterns for new
   tables; pick per case:
   - Versioned shared migration: `migrations/00N_<name>.sql`, sequential
     from `008`.
   - Feature-local bootstrap: `db.exec("CREATE TABLE IF NOT EXISTS ...")`
     plus an `ensureXColumn()` helper at the top of the feature's own `lib`
     module (see `lib/nvidia/blog-writer.ts:9-35`). Use this for a table
     that only one feature module touches.
2. **Secrets** — any new provider credential (Reddit app secret, a coding
   sandbox token, etc.) goes through `encryptSecret`/`decryptSecret`
   (`lib/crypto.ts`) and a `save<X>ApiKey()` helper in `lib/settings.ts`,
   exactly like `saveHedraApiKey`. Never add a new secret store.
3. **Composio adapters** — the repeatable shape, proven by
   `lib/instagram-composio.ts`, is: one `lib/<network>-composio.ts` file
   exporting `composio<Verb>()` functions that call
   `lib/composio/client.ts`, plus an `is<Network>ComposioConnected()`
   guard. Every new distribution agent (X, LinkedIn, Reddit) follows this
   exact file shape.
4. **Claw tools** — every new agent capability is exposed as one or more
   entries appended to the `CLAW_TOOLS` array in `lib/claw/tools.ts`
   (name, description, JSON-shaped `args` example, async `handler`). This
   is how the operator actually "talks to" every agent — Claw is already
   the AI-CMO-style chat surface this app has.
5. **Autopilot queues** — any agent that should run unattended on a
   cadence (SEO articles, GEO re-scoring, influencer discovery) reuses the
   `lib/blog-autopilot.ts` tick-loop shape: one `pending` row claimed per
   tick, `setTimeout` + `unref()`'d `setInterval`, skipped under
   `NODE_ENV=test`.
6. **Nav/IA** — `components/app-shell.tsx`'s `NAV` array is intentionally
   minimal right now because of the manual-calendar directive. Adding a
   nav item for every new agent would re-expand the surface the operator
   deliberately shrank. Default to exposing new agents through **Claw
   tools first**, and only add a dedicated top-level page when the
   feature needs a list/detail UI Claw's chat can't reasonably replace
   (Influencers kanban, Strategies document, SEO queue).
7. **Compliance guardrails carry over** — `AGENTS.md`'s existing rules
   (no fabricated testimonials/statistics/guarantees, PI-marketing
   constraints, "never dump secrets") apply to every new AI-authored
   surface (Strategies, GEO, Influencer outreach copy, X/LinkedIn/Reddit
   posts) exactly as they apply to video copy today. Extend the same
   system-prompt constraints into each new `lib/nvidia/*-writer.ts`
   module rather than writing new ones from scratch.
8. **Cost/rate control** — every new module that calls `chatCompletion`
   (NVIDIA) or a Composio action is a paid, rate-limited call. Reuse the
   existing single-in-flight-job convention (`running` boolean guard seen
   in `lib/blog-autopilot.ts:5`) for every new autopilot loop so agents
   don't fan out unbounded concurrent calls.

---

## 3. Per-feature scope

Each section: what the screenshot's feature name implies, what already
exists here, the gap, and granular steps to close it.

### 3.1 Website Analysis Agent

**Exists today**: `lib/site-research.ts` crawls a public site (SSRF-guarded,
≤6 pages, same-origin) and calls NVIDIA to extract `siteName`,
`targetAudience`, `brandVoice`, `topicFocus`, `keywords`, `cadence`, `cms`,
`phoneNumber` — but only as *onboarding defaults* for the SEO pipeline
(`lib/sites.ts`), not as a standalone audit product.

**Gap**: no audit *score*, no technical-SEO checklist, no GEO-readiness
signal, no competitor/content-gap notes — the crawl result is consumed once
and discarded into the onboarding form.

**Steps**:
1. Extend `sites` via `ensureSiteColumn()` (same pattern as
   `ensureBlogColumn` in `lib/nvidia/blog-writer.ts:27`): add
   `last_audit_json TEXT`, `seo_score INTEGER`, `geo_score INTEGER`,
   `last_audited_at TEXT`.
2. New `lib/site-audit.ts`: call the existing crawl in
   `researchWebsite()`/`safeFetchHtml()` (reuse, don't duplicate the
   SSRF guard) and extend the NVIDIA prompt to also return
   `technicalSeo{titleTagIssues[], metaDescriptionIssues[], headingStructureNotes, imageAltCoverageNote}`,
   `contentGaps[]`, `geoReadiness{hasStructuredData,hasFaq,directAnswerParagraphs,citableStatCoverage}`,
   `conversionNotes[]`.
3. New route `app/api/sites/[id]/audit/route.ts` (POST) persisting the
   result to `sites.last_audit_json` + computed scores.
4. Claw tool `audit_website` in `lib/claw/tools.ts` wrapping the same
   function, so the audit is reachable conversationally without a new nav
   item.
5. For JS-rendered/SPA sites where direct-fetch text extraction is thin,
   fall back to `scrapeWithSteel()` (`lib/steel.ts`) exactly the way
   Claw's existing `steel_scrape` tool already does.
6. UI: add an "Audit" tab to the existing `components/sites-console.tsx`
   (page currently gated out of nav per §2.6 — reachable via `/sites`
   directly, or re-add to `NAV` when the operator lifts manual-calendar
   mode for this surface).
7. Tests: unit test the scoring thresholds in isolation; extend
   `tests/e2e/sites.spec.ts` for the new audit tab.

### 3.2 Strategies Agent

**Exists today**: `lib/nvidia/campaign-planner.ts` plans a *single*
campaign's mission/subject/script/hook/caption. There is no cross-channel,
multi-week strategy object (goals, channel mix, content pillars).

**Gap**: entirely new data model above the single-campaign planner.

**Steps**:
1. `migrations/008_strategies.sql`:
   ```sql
   CREATE TABLE IF NOT EXISTS strategies (
     id TEXT PRIMARY KEY,
     site_id TEXT REFERENCES sites(id),
     title TEXT NOT NULL,
     horizon TEXT NOT NULL DEFAULT 'monthly' CHECK(horizon IN ('weekly','monthly','quarterly')),
     goals_json TEXT NOT NULL DEFAULT '[]',
     channel_mix_json TEXT NOT NULL DEFAULT '[]',
     content_pillars_json TEXT NOT NULL DEFAULT '[]',
     status TEXT NOT NULL DEFAULT 'draft',
     model TEXT,
     created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
     updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
   );
   CREATE TABLE IF NOT EXISTS strategy_revisions (
     id TEXT PRIMARY KEY,
     strategy_id TEXT NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
     editor TEXT,
     before_json TEXT NOT NULL,
     after_json TEXT NOT NULL,
     note TEXT,
     created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
   );
   ```
   (Mirrors `social_content_packages`/`social_content_revisions` exactly —
   same edit-provenance model already proven in this repo.)
2. New `lib/nvidia/strategy-planner.ts`: same `chatCompletion(jsonMode)`
   contract as `content-writer.ts`. Input = site audit result (3.1) +
   recent `monitor_runs` performance rows + `connected_accounts` (which
   channels are actually live). Output validated by a new
   `parseStrategy()` added to `lib/nvidia/schemas.ts`, same
   `SchemaError` pattern already used for `parseSocialContentPackage`.
3. Routes: `app/api/strategies/route.ts` (list/create),
   `app/api/strategies/[id]/route.ts` (get/patch/approve) — mirrors
   `app/api/campaigns/[id]/route.ts` shape.
4. Claw tools: `list_strategies`, `generate_strategy`, `approve_strategy`.
5. UI: `app/strategies/page.tsx` + `components/strategies-console.tsx`
   following `components/sites-console.tsx`'s list+detail+AI-draft+approve
   structure.
6. Stretch (Phase 2, not core): once approved, have
   `lib/blog-autopilot.ts` and `lib/campaign-autopilot.ts` prefer the
   active strategy's `content_pillars_json` when choosing what to
   generate next.
7. Tests: unit test for `parseStrategy` validation; e2e smoke: generate →
   edit → approve.

### 3.3 SEO Agent

**Exists today**: this is essentially already built, just not branded or
exposed as "SEO Agent". `sites` (cadence, keywords, CMS, tone) →
`lib/nvidia/blog-writer.ts` (`generateFullBlogPost`, with `meta_title`,
`meta_description`, `focus_keyword`, `slug`, `image_prompt`) →
`lib/blog-autopilot.ts` (cadence-driven queue) → `ensureAssetCalendarPost`
puts finished posts on the Calendar.

**Gap**: (a) hidden from nav under manual-calendar mode; (b) no
pass/fail SEO checklist beyond the raw meta fields; (c) publishing is
currently limited to the app's own bridge script
(`app/api/sites/bridge.js`) — there's no native WordPress/Shopify/Webflow
publish adapter, even though `sites.cms` already records which CMS the
site runs.

**Steps**:
1. Rebrand/expose: new `app/seo/page.tsx` (or a tab on the existing
   `/sites/[id]` detail view) showing the generation queue
   (`blog_posts.generation_status`), meta preview, and publish state —
   pure UI, no new backend.
2. Add `lib/seo/score.ts` — a cheap, non-AI pure function checking title
   length (50–60 chars), meta description length (120–160 chars), and
   focus-keyword presence in title/H1/first paragraph. No model call
   needed; this can run on every save.
3. Add CMS-native publish adapters, one per `sites.cms` value already
   captured: `lib/seo/publish-wordpress.ts` (WP REST
   `/wp-json/wp/v2/posts` via Application Passwords),
   `lib/seo/publish-shopify.ts` (Admin API blog articles endpoint),
   `lib/seo/publish-webflow.ts` (Webflow CMS API). Store the per-site
   credential the same way provider keys are stored: encrypted via
   `lib/crypto.ts`, in a new `sites.publish_credential_encrypted` column.
   Keep the existing `bridge.js` path as the fallback for `cms='custom'`
   / `'nextjs'` sites — don't remove it.
4. Claw tools: `list_seo_queue`, `generate_blog_post` (wraps
   `generateFullBlogPost`), `publish_blog_post`.
5. Image dependency: blog post images (`image_prompt`/`image_url`) are
   generation-provider calls, so they inherit the `IMAGE_GEN_ENABLED`
   gate. `sites.image_enabled` already exists as a **per-site** override
   — so text-only SEO posts can ship today even with image generation
   globally off; no code change needed for that case, only an operator
   choice per site.
6. Tests: unit test `lib/seo/score.ts`; e2e test the publish flow against
   a stubbed CMS endpoint (no live WordPress/Shopify call in CI).

### 3.4 GEO Agent (Generative-Engine Optimization)

**Exists today**: nothing. The closest adjacent pieces are the CMS/tech
signal detection already in `lib/site-research.ts` and the article body
already produced by the blog writer — but no structured data, no FAQ
schema, no "citability" scoring, no `llms.txt`.

**Gap**: net-new capability, but it composes cleanly onto the SEO Agent's
existing `blog_posts` rows rather than needing its own content pipeline.

**Steps**:
1. Extend `blog_posts` via the existing `ensureBlogColumn()` helper
   (`lib/nvidia/blog-writer.ts:27`): add `geo_schema_json TEXT`,
   `geo_faq_json TEXT`, `geo_score INTEGER`.
2. New `lib/nvidia/geo-writer.ts`, same `chatCompletion(jsonMode)`
   contract as `content-writer.ts`. Input = `blog_posts.body_markdown`.
   Output = `{faqPairs:[{q,a}], keyFactsForCitation:[], suggestedSchemaType, llmsTxtSnippet}`.
3. New `lib/geo/schema-generator.ts` — pure function, no AI call, wraps
   the writer's `faqPairs` into valid `schema.org` `FAQPage`/`Article`
   JSON-LD.
4. New route `app/api/sites/[id]/llms-txt/route.ts` serving a generated
   `llms.txt` (site summary + published article URLs + key citable
   facts) as `text/plain`, sourced from `sites` + `blog_posts` rows with
   `status='published'`.
5. `lib/geo/score.ts` — pure function checking: JSON-LD present, FAQ
   block present, first two sentences of each section directly answer
   its heading, stats have attribution. Feeds `blog_posts.geo_score` and
   rolls up into `sites.geo_score` from the Website Analysis audit
   (3.1).
6. Claw tools: `generate_geo_schema`, `get_llms_txt`.
7. UI: fold into the SEO Agent surface as a "GEO" tab (3.3) rather than a
   separate top-level nav item — same reasoning as §2.6.
8. Tests: unit tests for JSON-LD shape validity and `score.ts`
   thresholds.

### 3.5 Influencer Agent

**Exists today**: nothing directly. The only adjacent capabilities are
`lib/steel.ts` (public-web scraping, already SSRF-guarded) and
`lib/instagram-graph.ts` (a live, already-authorized Instagram Graph
token). No discovery, enrichment, outreach, or deal-tracking pipeline
exists.

**Gap**: the largest net-new pipeline in this list, and the one with the
most third-party-ToS exposure (scraping social platforms' own listing
pages is fragile and can violate platform terms; first-party APIs should
be preferred wherever one exists).

**Steps**:
1. `migrations/009_influencers.sql`:
   ```sql
   CREATE TABLE IF NOT EXISTS influencers (
     id TEXT PRIMARY KEY,
     handle TEXT NOT NULL,
     platform TEXT NOT NULL,
     profile_url TEXT,
     follower_count INTEGER,
     engagement_rate REAL,
     niche TEXT,
     contact_email TEXT,
     status TEXT NOT NULL DEFAULT 'prospect' CHECK(status IN ('prospect','contacted','negotiating','active','declined')),
     notes TEXT,
     source TEXT,
     discovered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
     created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
     updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
   );
   CREATE TABLE IF NOT EXISTS influencer_outreach (
     id TEXT PRIMARY KEY,
     influencer_id TEXT NOT NULL REFERENCES influencers(id) ON DELETE CASCADE,
     channel TEXT NOT NULL,
     message TEXT NOT NULL,
     sent_at TEXT,
     response_json TEXT,
     created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
   );
   ```
2. Discovery — prefer **first-party** where one is already unlocked:
   this app already holds a live Instagram Graph token
   (`lib/instagram-graph.ts`). Graph's `business_discovery` field can
   enumerate *public* Instagram business accounts by username without
   scraping — add `businessDiscovery(username)` to
   `lib/instagram-graph.ts` for that path.
3. For platforms with no first-party token yet, an MVP discovery mode
   uses `scrapeWithSteel()` (`lib/steel.ts`) against a public page the
   *operator explicitly supplies* (e.g., a hashtag or creator-directory
   URL they paste in) — never an automated crawl of a platform's internal
   search — plus a new `lib/nvidia/influencer-extractor.ts`
   (`chatCompletion(jsonMode)`) to structure candidate profiles out of
   the returned Markdown.
4. Outreach: reuse `sendDirectMessage`/`composioSendMessage`
   (`lib/instagram-graph.ts`/`lib/instagram-composio.ts`) for
   Instagram-based outreach — already live. For email, use Composio's
   already-cataloged Resend/Mailchimp toolkits
   (`lib/integrations/composio.ts`). Draft copy via a new
   `lib/nvidia/outreach-writer.ts`, same pattern as `content-writer.ts`.
5. Routes: `app/api/influencers/route.ts`,
   `app/api/influencers/[id]/route.ts`,
   `app/api/influencers/[id]/outreach/route.ts`.
6. Claw tools: `discover_influencers`, `list_influencers`,
   `update_influencer_status`, `send_influencer_outreach`.
7. UI: `app/influencers/page.tsx` + `components/influencers-console.tsx`
   (status-column/kanban list + detail drawer + draft-and-send outreach
   panel).
8. **Explicit risk callout**: general-purpose scraping of a platform's
   own discovery/search surfaces (not a single operator-supplied URL) is
   the single highest legal/ToS-risk item in this entire scope. Recommend
   restricting Phase 1 to (a) the first-party Graph `business_discovery`
   path and (b) operator-pasted single-profile URLs only — no automated
   multi-page discovery crawl without a separate compliance review.
9. Tests: unit test the extractor's schema parsing against fixture
   Markdown; e2e smoke test list/detail UI against seeded rows (no live
   scraping in CI).

### 3.6 X / Twitter Agent

**Exists today**: "X / Twitter" is a catalog entry only
(`lib/integrations/composio.ts:13`) — no adapter file, no Claw tools, no
compose UI. `scheduled_posts.network` is free-text, so `'x'` is already a
valid value with zero migration.

**Steps**:
1. `lib/x-composio.ts` modeled 1:1 on `lib/instagram-composio.ts`:
   `composioPostTweet(text, mediaUrl?)`, `composioGetMentions()`,
   `composioReplyTweet(tweetId, text)`, calling Composio's X toolkit
   through `lib/composio/client.ts`.
2. Confirm/record Composio's canonical toolkit slug for X (their API
   typically calls it `twitter`) in `COMPOSIO_TOOLKITS`
   (`lib/composio/client.ts`) — `lib/settings.ts`'s
   `composio.toolkits[].authConfigConfigured` reporting then works
   automatically, no other settings-layer change needed.
3. Publishing: add a small, network-keyed dispatch in the calendar
   publish route (`app/api/calendar/[id]/publish/route.ts`) rather than
   overloading the Instagram-specific `lib/calendar-publisher.ts` —
   add a parallel `lib/x-publish.ts` so the working Instagram path is
   never touched.
4. Claw tools: `x_post`, `x_reply`, `x_list_mentions`, `x_health` —
   same naming/shape convention as the existing `ig_*` tools.
5. UI: add "X" as a selectable network in the Calendar composer (already
   supports arbitrary `network` values) with a 280-character counter;
   Integrations page already renders the Composio catalog and its
   connected/not-connected state via `lib/settings.ts`.
6. Tests: extend `tests/e2e/calendar.spec.ts` for a `network:"x"` slot,
   Composio call mocked.

### 3.7 Coding Agent

**Exists today**: nothing. Claw's tools (`lib/claw/tools.ts`) only call
internal app functions — there is no shell/code-execution capability
anywhere in this codebase, and this app's own process is the production
server holding every secret (`APP_ENCRYPTION_KEY`, `ADMIN_PASSWORD`,
`SESSION_SECRET`, every provider key).

**This is the highest-risk item in the list.** Adding arbitrary code
execution *inside* the existing app container would be a severe security
regression against this repo's own stated security model (README
"Security model" section). The scope below assumes a **separate,
network-isolated sandbox service** is provisioned outside this repo — that
is an infrastructure/budget decision for the operator, not something this
codebase should implement in-process.

**Steps**:
1. Operator decision required first: stand up an external, ephemeral,
   per-session sandbox (container or micro-VM) with **no access** to this
   app's secrets or database. Out of scope for this repository to host.
2. `lib/coding-agent/client.ts`: a thin HTTP adapter to that sandbox
   (`runCommand`, `readFile`, `writeFile`, `listFiles`), each call scoped
   to one workspace id and wall-clock-timed out. Reuse the
   private/local-target rejection pattern already proven in
   `lib/site-research.ts`'s `isPrivateIp()` for any outbound network call
   the sandbox itself is allowed to make.
3. `migrations/010_coding_sessions.sql`:
   ```sql
   CREATE TABLE IF NOT EXISTS coding_sessions (
     id TEXT PRIMARY KEY,
     purpose TEXT,
     workspace_ref TEXT NOT NULL,
     created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
   );
   CREATE TABLE IF NOT EXISTS coding_commands (
     id TEXT PRIMARY KEY,
     session_id TEXT NOT NULL REFERENCES coding_sessions(id) ON DELETE CASCADE,
     command TEXT NOT NULL,
     exit_code INTEGER,
     output_excerpt TEXT,
     created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
   );
   ```
4. Claw tools: `coding_run`, `coding_read_file`, `coding_write_file`,
   `coding_list_files` — every call logged to `coding_commands`, output
   truncated with the same `clip()` helper already used for every other
   Claw tool result (`lib/claw/tools.ts:56`), and scrubbed for anything
   matching a stored secret pattern before it ever reaches the chat
   transcript (extends `AGENTS.md`'s existing "never dump secrets" rule
   to this new tool class).
5. UI: extend `components/claw-console.tsx`'s existing file tray with a
   terminal-style output pane, rather than adding a new top-level nav
   item — this is an operator/dev tool, not a marketing-facing surface.
6. Build this feature **last**, and only after explicit operator sign-off
   on the external sandbox and its budget — it is the one item in this
   scope that should not default to "build it."
7. Tests: unit-test only the adapter's request/response shaping and the
   secret-scrubbing function. Do not exercise a live sandbox in CI.

### 3.8 Reddit Distribution Agent

**Exists today**: nothing. Reddit is not even in the Composio catalog yet
(`lib/integrations/composio.ts`'s `composioConnectors` array does not list
it, unlike LinkedIn/X/TikTok which are catalog-only-but-listed).

**Steps**:
1. Add `"Reddit"` to `composioConnectors` in
   `lib/integrations/composio.ts` — the file's own header comment says
   this is a one-line, single-source-of-truth change and the Integrations
   page picks it up automatically.
2. Register Reddit's Composio auth config the same way every other
   toolkit is configured (`getAuthConfigId`, `lib/composio/client.ts`).
3. `lib/reddit-composio.ts`, same shape as `lib/instagram-composio.ts`:
   `composioSubmitPost(subreddit, title, bodyOrUrl)`,
   `composioListComments(postId)`, `composioReplyComment(commentId, text)`,
   `composioSearchSubreddits(query)`.
4. Compliance: subreddit self-promotion rules are enforced by human
   moderators per-community, not reliably by any API. Default Reddit
   `scheduled_posts` rows to `auto_post=0` regardless of the global
   calendar setting, and add `lib/reddit/rules-check.ts` as a pre-submit
   reminder step (cannot be fully automated — flag for manual review by
   design, not a gap to "fix").
5. Claw tools: `reddit_search_subreddits`, `reddit_submit_post`,
   `reddit_list_comments`, `reddit_reply`.
6. UI: Calendar network selector gains `"reddit"`; Integrations page
   requires no new component code beyond step 1, since it already renders
   the catalog generically.
7. Tests: e2e smoke test analogous to §3.6's, Composio call mocked.

### 3.9 AI Content Writer Agent

**Exists today**: the most complete item in this list.
`lib/nvidia/content-writer.ts` (`writeSocialPackage`) already produces
validated, multi-platform copy (Instagram/Facebook/YouTube/TikTok — hook,
captions, CTA, hashtags) with a stronger provenance model than a typical
content-writer feature: AI output and human edits are both preserved
(`social_content_packages.package_json` vs `.edited_json`), with a full
edit history in `social_content_revisions`.

**Gap**: (a) not exposed as its own standalone "write me a post" surface —
today it only fires implicitly off a campaign/video; (b) its platform
variants don't yet cover X, LinkedIn, or Reddit; (c) no path to generate
copy with no underlying video.

**Steps**:
1. Extend the `platformVariants` contract in
   `lib/nvidia/content-writer.ts`'s `SYSTEM_PROMPT` (and the matching
   parser in `lib/nvidia/schemas.ts`) with `x` (280-char aware),
   `linkedin` (longer-form/professional), and `reddit`
   (`{title, body}`) — additive fields, backward compatible with
   existing stored packages.
2. Add `writeStandalonePost(input:{topic, platform, tone, siteContext?})`
   to `lib/nvidia/content-writer.ts` — same `chatCompletion` call, a
   trimmer prompt builder that doesn't require a campaign/video object.
3. Claw tools: `write_post` (returns copy, no side effects) and
   `save_post` (persists the result as a draft `scheduled_posts` row).
4. UI: the cheapest integration point is the existing Creator caption
   flow (`app/creator/page.tsx`, `app/api/creator/caption/route.ts`) —
   add a `platform` parameter so it can call the new standalone writer
   instead of only its current caption logic.
5. Tests: unit test schema backward-compatibility (packages saved before
   this change still parse); e2e test the Creator caption flow with a
   platform switch.

### 3.10 LinkedIn Agent

**Exists today**: "LinkedIn Pages" is catalog-only
(`lib/integrations/composio.ts:12`) — identical gap shape to X/Twitter.

**Steps**: mirror §3.6 exactly —
1. `lib/linkedin-composio.ts` (`composioPostUpdate`, and org analytics if
   Composio's LinkedIn toolkit exposes it).
2. Claw tools: `linkedin_post`, `linkedin_health`.
3. Calendar network gains `"linkedin"`.
4. Long-form copy sourced from the AI Content Writer's new `linkedin`
   variant (§3.9, step 1).
5. **Setup decision, not a code gap**: Composio's LinkedIn OAuth product
   is typically scoped to either a company Page or a personal profile,
   not both under one auth config — the operator needs to decide which
   is being connected before the auth config is created.
6. Tests: same pattern as §3.6.

### 3.11 UGC Videos Agent

**Exists today**: already the single most built-out area of this
application — UGC is a first-class campaign category across the prompt
compiler (`lib/prompts.ts`, `lib/prompt-compiler.ts`), a dedicated script
writer (`lib/nvidia/ugc-writer.ts`), the avatar system
(`lib/avatars.ts`, `lib/avatar-generation/*`), split-screen/reaction
formats (`lib/split-compose.ts`, `lib/nvidia/split-screen-planner.ts`), and
all four video providers.

**Gap**: (a) gated off entirely by the `IMAGE_GEN_ENABLED=false`
operator directive (`lib/feature-flags.ts`) — none of this generates
live today; (b) folded into the generic Create/Campaigns flow rather than
branded as its own surface; (c) no batch/bulk generation queue distinct
from one-off Create.

**Steps**:
1. **Operator sign-off required before any of this can run**: this
   feature is currently switched off on purpose
   (`lib/feature-flags.ts:7-10`, "operator's directive 2026-08-27").
   Re-enabling `IMAGE_GEN_ENABLED` and restoring the gated nav items in
   `components/app-shell.tsx` is a business decision, not an engineering
   task — flag it as such rather than silently reverting it.
2. Once re-enabled: add a dedicated `app/ugc/page.tsx` (or relabel the
   existing `app/campaigns/page.tsx` filtered to `category='ugc'`)
   surfacing `lib/nvidia/ugc-writer.ts`'s script output and defaulting
   provider selection per the operator's preferred avatar-driven provider
   (Hedra/A2E, per the provider table in `AGENTS.md`).
3. Batch mode: `POST /api/internal/ugc/batch` accepting N briefs and
   enqueuing N `video_jobs` sequentially through the existing
   `createJob()` (`lib/jobs.ts`) — pure orchestration, no new provider
   logic.
4. Claw tool: `ugc_batch_generate`, alongside the already-existing
   `generate_video`/`generate_still` tools.
5. Tests: extend the existing `tests/e2e/create.spec.ts`,
   `tests/e2e/creator-upload-retry.spec.ts`, and
   `tests/e2e/image-gen-disabled.spec.ts` patterns to cover the batch
   endpoint and the re-enabled-flag path.

---

## 4. Suggested build order

| Phase | Agents | Why this order |
|---|---|---|
| 1 | AI Content Writer (extend), SEO Agent (expose), Strategies | Reuse the existing NVIDIA content pipeline and revision model almost as-is; lowest new-infrastructure cost. |
| 2 | GEO Agent | Composes directly onto Phase 1's `blog_posts` rows. |
| 3 | X/Twitter, LinkedIn, Reddit Distribution | One repeatable Composio-adapter pattern, proven three times over; mostly copy-paste-and-adapt from `lib/instagram-composio.ts`. |
| 4 | Website Analysis (full audit upgrade) | Builds on the existing crawler; needed as an input to Strategies and GEO scoring. |
| 5 | UGC Videos Agent | Mostly a re-enablement + branding pass — gated on an operator decision to lift `IMAGE_GEN_ENABLED`, not new engineering. |
| 6 | Influencer Agent | Net-new pipeline; needs a compliance decision on discovery method before write-up of the discovery module. |
| 7 | Coding Agent | Net-new *infrastructure* (external sandbox), highest security surface; build last and only after explicit sign-off. |

---

## 5. Decisions that need the operator, not an engineer

1. **UGC Videos Agent** cannot ship without reversing the 2026-08-27
   `IMAGE_GEN_ENABLED=false` directive — confirm this is intended before
   any work starts here.
2. **Influencer Agent discovery method** — first-party Graph
   `business_discovery` only, or operator-supplied single-profile URLs,
   or a broader scraping mode (not recommended without separate ToS/legal
   review).
3. **Coding Agent sandbox** — where it runs, who pays for it, and
   confirmation that it will never share credentials or a network
   boundary with the production app container.
4. **LinkedIn connection type** — company Page vs. personal profile (Composio
   auth-config scoping decision).
5. **Reddit auto-posting** — confirm the default-to-manual-approval
   posture in §3.8 is acceptable, or whether specific subreddits should be
   allow-listed for `auto_post=1`.

---

## 6. Testing/rollout checklist (per agent, repeat for each)

- [ ] Migration or feature-local table created; `PRAGMA table_info` sanity
      check for SQLite, `IF NOT EXISTS` idempotency confirmed.
- [ ] New `lib/nvidia/*-writer.ts` module (if any) carries the same
      truthfulness/compliance constraints as `content-writer.ts`'s system
      prompt.
- [ ] New secret (if any) stored via `lib/crypto.ts` + `lib/settings.ts`,
      never logged, never returned to the browser.
- [ ] Claw tool(s) added to `lib/claw/tools.ts`, args example matches the
      handler's actual accepted shape.
- [ ] `npm run typecheck` and `npm run lint` pass.
- [ ] Unit test added under `tests/unit/` for any pure-logic module
      (`score.ts`, schema parsers).
- [ ] Playwright e2e spec added/extended under `tests/e2e/` for any new
      page or calendar network.
- [ ] Nav decision made deliberately (§2.6) — Claw-only vs. dedicated page
      — not added by default.
- [ ] `README.md`/`AGENTS.md` updated if the change touches a documented
      product contract or provider table.
