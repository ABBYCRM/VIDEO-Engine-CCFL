# DigitalOcean App Platform env names (VIDEO-Engine-CCFL)

Names only. Values already live on DigitalOcean as SECRET / app env.
Do **not** commit values. Do **not** paste keys into chat, logs, or PRs.

One app (`video-engine-ccfl`) now hosts both components from this repo:

- `web` — Claw console (public)
- `aion-brain` — absorbed Brain runtime (internal)

There is no login wall. `ADMIN_PASSWORD` is unused. `SESSION_SECRET` remains
only for Composio OAuth state HMAC.

## Required on `web`

| Name | Why |
|---|---|
| `SESSION_SECRET` | HMAC for Composio OAuth `state` (≥32 chars). Not a password gate. |
| `APP_ENCRYPTION_KEY` | AES-256-GCM settings store. Base64 32-byte key. |
| `DATABASE_URL` | Bound Managed Postgres (`${db.DATABASE_URL}` in `.do/app.yaml`). |
| `BITDEER_API_KEY` | Primary Claw chat / vision / embed / rerank. |
| `AION_BASE_URL` | `${aion-brain.PRIVATE_URL}` (in-app). Defaults in code to `http://aion-brain:10000`. |
| `AION_API_KEY` | Regular Brain key (`X-AION-Key`). Must match an entry in Brain `AION_API_KEYS`. |

Do **not** set `AION_BASE_URL` to `https://aion-brain-6iptg.ondigitalocean.app`.

## Required on `aion-brain` (same app)

| Name | Why |
|---|---|
| `AION_API_KEYS` | Fail-closed production boot. Same value as web `AION_API_KEY` (or a comma list that includes it). |
| `AION_ADMIN_KEYS` | Brain admin routes. |
| `BITDEER_API_KEY` / `BITDEER_BASE_URL` | Brain `/v1` + `/api/chat` stay Bitdeer-primary. |
| `CURSOR_API_KEY` | Brain-owned Cursor Cloud Agents. |

Copy these secrets from the standalone `aion-brain` DigitalOcean app onto
the `aion-brain` component of `video-engine-ccfl`, then destroy the
standalone app.

## Optional names (already named on DO — inject, do not invent)

`NVIDIA_API_KEY`, `NVIDIA_API_KEYS`, `BITDEER_API_KEYS`, `STEEL_API_KEY`,
`STEEL_BASE_URL`, `COMPOSIO_API_KEY`, `E2B_API_KEY`, `FIRECRAWL_API_KEY`,
`TAVILY_API_KEY`, `EXA_API_KEY`, `SCRAPINGBEE_API_KEY`, `SCRAPFLY_API_KEY`,
`SCREENSHOTONE_ACCESS_KEY`, `SCREENSHOTONE_SECRET_KEY`, `HEDRA_API_KEY`,
`RESEND_API_KEY`, `RESEND_FROM`, `GITHUB_PERSONAL_ACCESS_TOKEN`,
`INSTAGRAM_MCP_ACCESS_TOKEN`, `INSTAGRAM_MCP_IG_USER_ID`,
`INSTAGRAM_MCP_APP_SECRET`, `GDY_API_KEY`, `GDY_API_KEY_ALT`,
`GDY_API_BASE` / `GDY_BASE_URL`, `PINECONE_API_KEY`, `EMBEDDINGS_API_KEY`,
`DIGITALOCEAN_TOKEN` (Computer orchestrator only — `lib/browser-computer/digitalocean.ts`),
`N8N_MCP_URL`, `N8N_MCP_TOKEN`, `N8N_API_KEY`, `CURSOR_API_BASE_URL`.

## Cutover

1. Deploy this branch to `video-engine-ccfl` (adds the `aion-brain` component).
2. Set `AION_API_KEYS` / `AION_ADMIN_KEYS` / provider secrets on that component.
3. Set web `AION_BASE_URL` to `${aion-brain.PRIVATE_URL}` (already in `.do/app.yaml`).
4. Confirm `GET /api/ready` on web and `GET /healthz` on the internal brain.
5. Open `/claw` — no `/login`. Ask `aion_status`, then a toolful `aion_execute`.
6. Destroy the standalone DigitalOcean app `aion-brain`.
7. Leave `ABBYCRM/Aion-Brain` on GitHub as history. Archive or delete it later
   from an account that has admin permission. Runtime no longer needs that remote.

`GET /api/health` is the operator-triggered deep diagnostic — not the
platform health check.
