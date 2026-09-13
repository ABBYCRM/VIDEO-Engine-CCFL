# Cursor Cloud Agents — Brain-owned, CCFL proxy

The in-app Brain (`services/aion-brain`) **owns** Cursor control
(`lib/cursor_cloud.js`). VIDEO-Engine-CCFL does **not** call
`api.cursor.com` and does not keep a second client stub.

## Ownership

| Surface | Owner |
|---|---|
| `CURSOR_API_KEY` → Cursor Cloud Agents v1 | **Aion-Brain** |
| `POST /api/cursor/launch` · `GET /api/cursor/:id` · `POST .../reply` · `POST .../cancel` | **Aion-Brain** (authoritative) |
| CCFL `cursor_launch` / `cursor_status` / `cursor_reply` / `cursor_cancel` | **proxy** to the in-app brain via `AION_API_KEY` (`X-AION-Key`) |
| `POST /api/claw/execute` (`/api/agent/run`) | **Aion-Brain** execute — not Cursor |

If Brain and CCFL are co-hosted, one `CURSOR_API_KEY` is enough (name in
`.env.example`). Separate hosts: set the same env **name** on the Brain
droplet. CCFL never sends that key.

## CCFL HTTP (forwards to Brain)

| CCFL | Brain |
|---|---|
| `POST /api/cursor/launch` | `POST /api/cursor/launch` |
| `GET /api/cursor` | `GET /api/cursor` |
| `GET /api/cursor/:id` | `GET /api/cursor/:id` |
| `POST /api/cursor/:id/reply` | `POST /api/cursor/:id/reply` |
| `POST /api/cursor/:id/cancel` | `POST /api/cursor/:id/cancel` |

Legacy `/api/cursor/agents*` aliases call the same proxy.

Missing Aion handshake → Trinity **HOLD** (`AION_UNCONFIGURED`).
Brain missing `CURSOR_API_KEY` → Brain `{ error: cursor_launch_unconfigured }` → HOLD.

## Assistant contract

Non-trivial repo work → **ask Brain** `cursor_launch` (dynamic, on-spot).
Do not do heavy repo work inline. Do not pick a prefab agent.
Shell → `shell_run` / `e2b_run`. Computer → `computer_*`.
