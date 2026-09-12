# VIDEO-Engine

Single-shot AI video generation service for personal-injury marketing and general UGC production. The engine compiles a campaign mission into one compact Veo prompt and makes exactly **one 8-second generation request**. It never creates an automatic montage, never extends a clip, and never stitches multiple model generations.

## Campaign buttons

- Car Accident
- Rideshare / Uber / Lyft
- Trucking / 18-Wheeler
- Slip & Fall
- UGC Video

Each mode carries its own prompt policy. The prompt compiler adds shared photorealism, human anatomy, physics, audio, temporal-consistency, and legal-ad constraints while keeping the final provider prompt under a conservative size cap.

## Architecture

```text
Browser / external software
        |
        +--> Admin session or ve_live_* API token
        |
        +--> VIDEO-Engine prompt compiler
        |      - category template
        |      - user mission / subject / dialogue
        |      - realism + physics constraints
        |      - legal marketing guardrails
        |      - ONE CONTINUOUS SHOT directive
        |
        +--> Gemini API / Veo 3.1 (one operation, exactly 8 seconds)
        |
        +--> operation polling
        |
        +--> protected MP4 download / on-screen player
```

## Security model

- Never commit `GEMINI_API_KEY`, GitHub tokens, admin passwords, or session secrets.
- Gemini API keys saved in the Settings page are encrypted at rest with AES-256-GCM using `APP_ENCRYPTION_KEY`.
- The Gemini key is never returned back to the browser after storage.
- VIDEO-Engine API tokens use the format `ve_live_*`; the raw token is displayed once and only a SHA-256 hash is stored.
- Revoke exposed credentials immediately.

## Instagram publishing

Calendar auto-post, Library **Post to Instagram**, split-screen publish, and **Claw** use Composio Instagram first. If Composio is disconnected or an action fails, the same call retries through the direct Instagram Graph connector ported from [adelaidasofia/instagram-mcp](https://github.com/adelaidasofia/instagram-mcp), and Claw reports the fallback.

On **Integrations**, connect Composio Instagram for the primary path. Its OAuth auth config must include the Meta scopes required by the actions you use. For the direct Graph fallback, save a long-lived token (scopes `instagram_basic` + `instagram_content_publish` + `instagram_manage_comments`; DMs also need `instagram_manage_messages`) and the numeric Instagram Business Account id. Same env names as the MCP: `INSTAGRAM_MCP_ACCESS_TOKEN`, `INSTAGRAM_MCP_IG_USER_ID`. `INSTAGRAM_MCP_DM_ENABLED=1` enables DMs only on the direct Graph path after App Review; it does not gate Composio. Both providers can send only within Meta's allowed window for an existing conversation. Instagram fetches published media itself, so `PUBLIC_BASE_URL` must be public https.

**Claw** is the left-nav operator chat, using NVIDIA Nemotron 3.5 Lightning 30B A3B on DigitalOcean for low-latency agent and tool work. Override it with `CLAW_NVIDIA_MODEL`. It can generate, approve, post, read/reply comments, and DMs, with a Grok-style thread/file tray.

Set `STEEL_API_KEY` to let Claw research public web pages through Steel.dev. Claw receives clean Markdown, page metadata, links, and optional screenshots; local and private network targets are rejected.

## Claw Computer

Claw can drive a live Chromium session the operator can see and take over — same Chrome, same cookies, no restart on handoff. Tools: `computer_open`, `computer_click`, `computer_type`, `computer_keypress`, `computer_scroll`, `computer_handoff`, `computer_resume`. Passwords, MFA, CAPTCHA, passkeys, and payments pause the agent and flip `control_owner` to HUMAN. Steel scrape stays until this path is the default in production.

Local: `npx playwright install chromium`. Production worker: DigitalOcean Droplet from a golden snapshot (`DIGITALOCEAN_BROWSER_SNAPSHOT_ID`). The LLM never receives `DIGITALOCEAN_TOKEN`.

Open `/computer` for the live screen.

## Claw Swarm

Default path is **dynamic on-spot spawn** (Grok Task-like): `POST /api/swarm` `op=spawn` with `goal`, optional `context`, `tools`, `successCriteria`. Workers are ephemeral `role=worker` unless you pass an optional preset (`researcher` / `critic` / `synthesizer`). Parallel spawn, `swarm_message` steer, `swarm_stop` one wedged worker, then cleanup. `swarm_run` remains the optional planner DAG.

Open `/swarm`. Claw tools: `swarm_spawn`, `swarm_wait`, `swarm_message`, `swarm_stop`, `swarm_status`, `swarm_run` (preset). Optional `runner=aion` sends that worker through Aion-Brain `POST /api/claw/execute`.

## Cursor Cloud Agents (via Aion-Brain)

Aion-Brain **owns** Cursor (`lib/cursor_cloud.js`). CCFL only proxies:

- Non-trivial repo work → Claw `cursor_launch` → Brain `POST /api/cursor/launch`. Dynamic, not a prefab menu. Not inline heavy coding.
- Handshake: `AION_BASE_URL` + `AION_API_KEY` (`X-AION-Key`). `CURSOR_API_KEY` stays on Brain (name in `.env.example` for co-host only).
- Missing Brain or Brain missing the key → Trinity **HOLD**.
- `cursor_status` / `cursor_reply` / `cursor_cancel` map to Brain `/api/cursor/:id`, `.../reply`, `.../cancel`.
- `POST /api/agent/run` stays `aion_execute`. See `docs/CURSOR_CLOUD_AGENTS.md`.

Claw also proxies Brain BOS (`/api/memory/bos`), Trinity (`/api/decision`), routines (including `/run`), MCP (`/api/mcp/status`), and ephemeral agents (`/api/agents/spawn`). Contract: `docs/aion-brain.md`. DigitalOcean env **names**: `docs/DIGITALOCEAN_ENV.md`.

## Local setup

```bash
cp .env.example .env
npm install
npm run token:key
# paste the generated base64 value into APP_ENCRYPTION_KEY
# set ADMIN_PASSWORD (≥8, not 1234/change-me) and SESSION_SECRET (≥32)
# set AION_BASE_URL + AION_API_KEY to reach Brain (see docs/DIGITALOCEAN_ENV.md)
npm run dev
```

Open `http://localhost:3000/login`, sign in, then open **Claw**.

## External API

### Create a video

`POST /api/v1/video`

Header:

```text
Authorization: Bearer ve_live_...
Content-Type: application/json
```

Body:

```json
{
  "category": "car_accident",
  "mission": "Create a realistic PI-awareness shot after a rear-end collision",
  "subject": "Adult woman safely standing beside a damaged sedan",
  "script": "I didn't know what I needed to document after the crash.",
  "aspectRatio": "9:16",
  "resolution": "1080p"
}
```

Response (`202`):

```json
{
  "id": "uuid",
  "status": "running",
  "statusUrl": "/api/v1/video/uuid",
  "durationSeconds": 8,
  "oneShot": true
}
```

### Poll a video

`GET /api/v1/video/:id` with the same Bearer token. When status is `succeeded`, the response contains `fileUrl`.

### Download / stream

`GET /api/v1/video/:id/file` with the same Bearer token.

### Reference image

External clients may include a single image as base64:

```json
{
  "imageBase64": "...",
  "imageMimeType": "image/png"
}
```

The service caps reference images at 10MB. For image-to-video, Veo's adult-person restrictions apply.

## One-shot protocol

The server, not the browser, enforces this:

- `durationSeconds = 8`
- `numberOfVideos = 1`
- prompt starts with `ONE CONTINUOUS SHOT ONLY`
- no extension endpoint exists
- no multi-shot endpoint exists
- no stitch/merge endpoint exists

This is intentional. If a longer campaign is needed later, orchestration should happen in a separate product layer rather than silently changing VIDEO-Engine's one-shot contract.

## Legal marketing note

The included PI templates are deliberately conservative. They reject/prompts against guaranteed recoveries, invented settlements, fake clients/testimonials, unsupported medical diagnoses, and synthetic footage presented as real evidence. Attorney-advertising rules vary by jurisdiction; production campaigns should still be reviewed for the target state/country.

## DigitalOcean deployment

The repo includes a Dockerfile and persistent `/app/data` directory. For DigitalOcean:

1. Create an App or Droplet from this GitHub repository.
2. Build from the Dockerfile and expose port `3000`.
3. Configure secrets: `ADMIN_PASSWORD`, `SESSION_SECRET`, `APP_ENCRYPTION_KEY`.
4. Attach persistent storage mounted at `/app/data` if using SQLite and local MP4 storage.
5. Set `PUBLIC_BASE_URL` to the final HTTPS hostname.
6. After first login, add the Gemini API key through Settings, or configure `GEMINI_API_KEY` as a DigitalOcean secret.
7. For horizontal scaling, replace SQLite/local MP4 storage with managed PostgreSQL + Spaces object storage before adding multiple replicas.

## AI maintainer instructions

Any AI modifying this repository must preserve these invariants unless the owner explicitly changes the product contract:

1. Never hard-code, print, commit, or return secrets.
2. One user generation request = one Veo provider operation = one 8-second video.
3. Do not add multi-shot generation, video extension, or automatic stitching to the generation path.
4. Keep prompt compilation server-side and below the provider prompt limit.
5. Preserve the five campaign categories and their safety/legal constraints.
6. API tokens are hash-only at rest and raw values are displayed once.
7. Generated-video endpoints remain authenticated.
8. Maintain TypeScript strict mode and shadcn-compatible `/components/ui` structure.
9. Validate all user-controlled enum values, image size, and prompt field lengths.
10. Do not claim a video succeeded until Veo reports completion and the MP4 has been downloaded successfully.
