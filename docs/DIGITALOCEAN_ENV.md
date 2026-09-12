# DigitalOcean App Platform env names (VIDEO-Engine-CCFL)

Names only. Values already live on DigitalOcean as SECRET / app env.
Do **not** commit values. Do **not** paste keys into chat, logs, or PRs.

This frontend (`video-engine-ccfl`) talks to a separately deployed
Aion-Brain service. Brain keys stay on the Brain app unless a name is
explicitly listed as CCFL-side.

## Required on this frontend (CCFL)

| Name | Why |
|---|---|
| `ADMIN_PASSWORD` | `POST /api/admin/login`. Min 8 chars. Rejects `1234` / `change-me` / `password` / `admin`. |
| `SESSION_SECRET` | HMAC for `claw_session`. Min 32 chars. |
| `APP_ENCRYPTION_KEY` | AES-256-GCM settings store. Base64 32-byte key. |
| `DATABASE_URL` | Bound Managed Postgres (`${db.DATABASE_URL}` in `.do/app.yaml`). |
| `BITDEER_API_KEY` | Primary Claw chat / vision / embed / rerank. |
| `AION_BASE_URL` | HTTPS origin of the running Aion-Brain service (no path, no credentials). |
| `AION_API_KEY` | Regular Brain key (`X-AION-Key`). Must match an entry in Brain `AION_API_KEYS`. Admin keys stay on Brain. |

Local HTTP is allowed only for `localhost` / `127.0.0.1` / `aion-brain`.
Hosted CCFL cannot reach a private Docker hostname on a laptop.

## Required on Aion-Brain (not this app)

| Name | Why |
|---|---|
| `AION_API_KEYS` | Fail-closed production boot. |
| `AION_ADMIN_KEYS` | Brain admin routes. |
| `BITDEER_API_KEY` / `BITDEER_BASE_URL` | Brain `/v1` + `/api/chat` stay Bitdeer-primary. |
| `CURSOR_API_KEY` | Brain-owned Cursor Cloud Agents. Same DigitalOcean secret **name** may exist on CCFL; CCFL does not call `api.cursor.com`. |

## Optional on CCFL (already named on DO — inject, do not invent)

`NVIDIA_API_KEY`, `NVIDIA_API_KEYS`, `BITDEER_API_KEYS`, `STEEL_API_KEY`,
`STEEL_BASE_URL`, `COMPOSIO_API_KEY`, `E2B_API_KEY`, `FIRECRAWL_API_KEY`,
`TAVILY_API_KEY`, `EXA_API_KEY`, `SCRAPINGBEE_API_KEY`, `SCRAPFLY_API_KEY`,
`SCREENSHOTONE_ACCESS_KEY`, `SCREENSHOTONE_SECRET_KEY`, `HEDRA_API_KEY`,
`RESEND_API_KEY`, `RESEND_FROM`, `GITHUB_PERSONAL_ACCESS_TOKEN`,
`INSTAGRAM_MCP_ACCESS_TOKEN`, `INSTAGRAM_MCP_IG_USER_ID`,
`INSTAGRAM_MCP_APP_SECRET`, `GDY_API_KEY`, `GDY_API_KEY_ALT`,
`GDY_API_BASE` / `GDY_BASE_URL`, `PINECONE_API_KEY`, `EMBEDDINGS_API_KEY`,
`DIGITALOCEAN_TOKEN` (Computer orchestrator only — `lib/browser-computer/digitalocean.ts`),
`COOKIE_SECURE` (`0` for http localhost cookies, `1` to force Secure).

## Brain-only names (document for co-host / ops — CCFL does not read them)

`N8N_MCP_URL`, `N8N_MCP_TOKEN`, `N8N_API_KEY`, `CURSOR_API_BASE_URL`,
`PINECONE_INDEX_HOST`, `INNGEST_EVENT_KEY`, `YOUTUBE_API_KEY`,
`GEMINI_API_KEY`, `XAI_API_KEY`, `KIMI_API_KEY`, `OPENAI_API_KEY`.

Optional LLM tools on CCFL may read Gemini/xAI/Kimi/OpenAI names when the
operator names those providers. They never replace Bitdeer as the Claw brain.

## Deploy this frontend

1. Confirm the names above exist on the CCFL App Platform app (values already encrypted).
2. Deploy this branch / PR to the `web` service in `.do/app.yaml`.
3. Health: `GET /api/ready` (constant-time; not Brain, not Bitdeer).
4. After deploy: open `/login`, sign in with `ADMIN_PASSWORD`, then on Claw ask
   `aion_status` then a toolful question that must hit `aion_execute`.
5. `GET /api/health` is the operator-triggered deep diagnostic — not the
   platform health check.
