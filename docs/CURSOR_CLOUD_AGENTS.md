# Cursor Cloud Agents (CCFL-owned)

VIDEO-Engine-CCFL talks to the public Cursor Cloud Agents API v1 so Claw
can spawn / steer / stop cloud agents the way Grok Bot does — **dynamic
on the spot**, not a prefab agent menu.

## Ownership

| Surface | Owner | Notes |
|---|---|---|
| `CURSOR_API_KEY` → `https://api.cursor.com/v1/agents` | **CCFL** | Launch, list, get, reply, cancel |
| `POST /api/claw/execute` (`/api/agent/run` alias) | **Aion-Brain** | Brain tools only. Do not send Cursor jobs here. |
| `/api/agents` handshake | **does not exist** | Do not invent `agent_jobs` on Brain for Cursor. |

CCFL implements Cursor control locally. A thin Brain proxy was rejected
because Brain does not own these jobs.

## Auth

- Env **name**: `CURSOR_API_KEY` (already a DigitalOcean SECRET).
- Optional: `CURSOR_API_BASE_URL` (default `https://api.cursor.com`).
- Client uses HTTP Basic `-u KEY:` (Bearer also accepted upstream).
- The raw key is never logged, returned, or written to git. `.env.example`
  documents the **name only**.

Missing key → `{ ok:false, trinity:"HOLD", code:"MISSING_KEY" }`. Not silent.

## Brief (Grok Bot)

`cursor_launch` compiles:

- goal / prompt
- repo URL (default `https://github.com/ABBYCRM/VIDEO-Engine-CCFL`)
- success criteria
- evidence rules: methodical-notes branches, no stubs, no hallucination,
  never ask the operator to fix what the agent can fix

## HTTP

| Method | Path | Op |
|---|---|---|
| POST | `/api/cursor/agents` | launch (`op` defaults to launch; also spawn/create) |
| GET | `/api/cursor/agents` | list |
| GET | `/api/cursor/agents?id=` or `/api/cursor/agents/:id` | status + latest run |
| POST | `/api/cursor/agents/:id/reply` or `/steer` | follow-up |
| POST | `/api/cursor/agents/:id/cancel` | cancel latest or given run |

Upstream (public beta):

- `POST /v1/agents` create + initial run
- `GET /v1/agents` list
- `GET /v1/agents/{id}` get
- `POST /v1/agents/{id}/runs` follow-up (`409 agent_busy`)
- `GET /v1/agents/{id}/runs/{runId}` run result
- `POST /v1/agents/{id}/runs/{runId}/cancel` (`409 run_not_cancellable`)
- `GET /v1/me` key probe (live smoke)

## Claw tools

`cursor_launch` `cursor_status` `cursor_reply` `cursor_cancel`

`claw_dispatch agent=cursor` with `task` = brief and `url` = repo.

## Grok Bot behavior

Warm, concise, evidence-first. Trinity GO/HOLD/ABORT. Dynamic spawn
(local `swarm_spawn` **and** Cursor for repo work). Computer/browser/shell
when present. Retrieve BOS memory before BOS answers. Execution over
explanation. Never ask the user to fix code the system can fix.
