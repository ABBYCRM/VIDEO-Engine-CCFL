# DigitalOcean App Platform env names (VIDEO-Engine-CCFL)

App: `video-engine-ccfl`  
id: `b5f68e19-fbfa-469d-acea-1d4278e8b475`  
public: https://video-engine-ccfl-jpd37.ondigitalocean.app

Names only. Values already live on DigitalOcean as SECRET / app env.
Do **not** commit values. Do **not** paste keys into chat, logs, or PRs.

One app hosts both components from this repo:

- `web` — Claw console (public)
- `aion-brain` — absorbed Brain runtime (internal)

No login wall. `ADMIN_PASSWORD` is unused. `SESSION_SECRET` remains only
for Composio OAuth state HMAC.

## Exact names already on this DO app (bind, do not invent)

These names are already configured on `video-engine-ccfl` (and/or the
retired standalone `aion-brain` app). `.do/app.yaml` declares the same
names so a force-deploy after merge attaches them.

| Name | Component | Runtime |
|---|---|---|
| `BITDEER_API_KEY` | web + aion-brain | Primary Claw / Brain chat, embed, rerank (Bitdeer). |
| `NVIDIA_API_KEY` | web + aion-brain | Alias of the Bitdeer key. |
| `BITDEER_BASE_URL` / `NVIDIA_BASE_URL` | both | `https://api-inference.bitdeer.ai/v1` |
| `AION_API_KEY` | web | `X-AION-Key` to the in-app brain. |
| `AION_API_KEYS` | aion-brain | Fail-closed Brain boot. Must include the web `AION_API_KEY` value. |
| `AION_ADMIN_KEYS` | aion-brain | Brain admin routes. Copy from the retired aion-brain app. |
| `AION_BASE_URL` | web | `${aion-brain.PRIVATE_URL}` — not `aion-brain-6iptg.ondigitalocean.app`. |
| `COMPOSIO_API_KEY` | web + aion-brain | Live Composio (`composio_health` / `composio_action`). |
| `CURSOR_API_KEY` | aion-brain | Brain-owned Cursor Cloud Agents. Web only proxies. |
| `STEEL_API_KEY` | web + aion-brain | `steel_scrape` / Brain steel_browser. |
| `STEEL_BASE_URL` | both | `https://api.steel.dev` |
| `DIGITALOCEAN_TOKEN` | web only | Computer droplet orchestrator (`lib/browser-computer/digitalocean.ts`). Never a Claw tool. |
| `SESSION_SECRET` | web | Composio OAuth `state` HMAC (≥32). Not a password gate. |
| `APP_ENCRYPTION_KEY` | web | AES-256-GCM settings store. |
| `DATABASE_URL` | web | Bound Managed Postgres `${db.DATABASE_URL}`. |
| `E2B_API_KEY` | web | `e2b_run` / `shell_run`. |
| `FIRECRAWL_API_KEY` | web + aion-brain | Scrape fallback. |
| `TAVILY_API_KEY` / `EXA_API_KEY` | web + aion-brain | Search tools. |
| `GITHUB_PERSONAL_ACCESS_TOKEN` | web | Direct GitHub REST; prefer Composio GitHub when connected. |
| `GDY_API_KEY` / `GDY_API_KEY_ALT` | web (+ brain) | OSINT tools. |
| `N8N_MCP_TOKEN` / `N8N_API_KEY` | aion-brain | Brain n8n MCP. Copy from retired brain app. |

Do **not** set `AION_BASE_URL` to `https://aion-brain-6iptg.ondigitalocean.app`.

## Cutover (coordinator)

1. Merge this PR to `main`. Force-deploy `video-engine-ccfl` from `.do/app.yaml`.
2. New component `aion-brain` appears. Attach `AION_API_KEYS` / `AION_ADMIN_KEYS`
   (copy from the standalone aion-brain app, or set `AION_API_KEYS` to the
   existing web `AION_API_KEY`).
3. Confirm web `AION_BASE_URL` interpolated to `${aion-brain.PRIVATE_URL}`.
4. `GET https://video-engine-ccfl-jpd37.ondigitalocean.app/api/ready`.
5. Open `/claw` — no `/login`. Ask `aion_status`, then a toolful execute.
6. Destroy standalone DigitalOcean app `aion-brain`.
7. Leave `ABBYCRM/Aion-Brain` on GitHub as history. Archive later if desired.

`GET /api/health` is the operator deep diagnostic — not the platform probe.
