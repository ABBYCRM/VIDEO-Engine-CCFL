# Claw and in-app Aion-Brain

Brain runtime lives in `services/aion-brain` (pin `cd55451`, gateway
`0.1.24`). Production uses the `aion-brain` component of the
`video-engine-ccfl` DigitalOcean app. The separate GitHub repo
`ABBYCRM/Aion-Brain` and the standalone DigitalOcean app
`https://aion-brain-6iptg.ondigitalocean.app` are not required at runtime.

Claw calls the in-app Brain with `AION_API_KEY` (`X-AION-Key`).
`AION_BASE_URL` defaults to `http://aion-brain:10000` (compose / App
Platform `PRIVATE_URL`). For work that must use tools, Claw prefers
`POST /api/claw/execute` (`aion_execute`; alias `/api/agent/run`).
Aion `/api/agent/run` is **brain tool execution**, not Cursor Cloud Agents.

Brain **owns** Cursor (`lib/cursor_cloud.js`, `POST /api/cursor/launch`).
CCFL Claw tools `cursor_launch` / `cursor_status` / `cursor_reply` /
`cursor_cancel` **forward** to those Brain routes with `X-AION-Key`.
`CURSOR_API_KEY` stays on the brain service.

`aion_status` and `aion_consult` stay advice-only: consult still posts
`/api/chat` without `"agentic"` unless the caller sets `agentic: true`.
`previous_tool_results` are the only Aion evidence; Claw never marks a
local execution verified from Aion prose.

| VIDEO route | Brain route |
|---|---|
| Claw tools `aion_execute` | `POST /api/claw/execute` |
| Claw tools `aion_consult` | `POST /api/chat` |
| Claw tools `aion_status` | `GET /api/state` |
| `GET/POST /api/memory/bos` | `GET/POST /api/memory/bos` |
| `POST /api/decision` | `POST /api/decision` |
| `/api/routines` (+ `:name` get/run/pause/resume/delete) | same |
| `GET /api/mcp/status` | `GET /api/mcp/status` |
| `GET /api/connectors` | local inventory + Brain `GET /api/connectors` |
| `/api/agents/spawn` + `/api/agents/:id` | same |
| `/api/cursor/*` | `/api/cursor/*` |

BOS writes send Brain fields `{ content, title, source_id, authority: "continuity" }`.
`text` is not a Brain upsert field. GET without `q` is Brain status + ingest-if-missing.

There is no login wall. `/claw` and the APIs above are open.

## Local stack

```bash
cd ~/VIDEO-Engine-CCFL && git fetch origin && git switch main && git pull --ff-only origin main && bash scripts/setup-aion-local.sh
```

The script preserves `.env` and the existing Claw data volume. It creates a
private `.aion.env`, builds **this repo's** `services/aion-brain` image
(no GitHub clone), and checks authenticated reachability from Claw.

Open http://localhost:3000/claw — no `/login` step.

```bash
sudo docker compose --env-file .aion.env -f docker-compose.aion.yml ps
sudo docker compose --env-file .aion.env -f docker-compose.aion.yml logs --tail=60
sudo docker compose --env-file .aion.env -f docker-compose.aion.yml stop
```

## Hosted (DigitalOcean)

One app: `video-engine-ccfl`. `web` talks to `aion-brain` over
`${aion-brain.PRIVATE_URL}`. After cutover, destroy the standalone
`aion-brain` DigitalOcean app. See `docs/DIGITALOCEAN_ENV.md`.
