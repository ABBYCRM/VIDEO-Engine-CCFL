# VIDEO-Engine-CCFL (Claw)

Operator console for Claw: chat, Computer, Swarm, Forge, Integrations, and an Aion-Brain proxy for Cursor cloud agents.

This tree does **not** generate videos. There is no `POST /api/v1/video` and no Veo / Hedra / Grok / A2E generation client. Hedra is connectivity status only.

## Architecture

```text
Browser
   |
   +--> /login  (ADMIN_PASSWORD → HS256 JWT in claw_session)
   |
   +--> requireAdmin() on every control API
   |      or Authorization: Bearer ve_live_*
   |
   +--> Claw (Bitdeer chat + tools)
   |      Computer / Forge / Swarm
   |      Composio + Steel + E2B
   |      cursor_* → Aion-Brain (CURSOR_API_KEY stays on Brain)
```

## Security model

- Never commit provider keys, admin passwords, or session secrets.
- `SESSION_SECRET` (≥32 chars) signs JWT sessions. `ADMIN_PASSWORD` is the only unlock — never `1234`.
- Settings-store keys use AES-256-GCM (`APP_ENCRYPTION_KEY`).
- `ve_live_*` tokens are SHA-256 at rest; the raw value is shown once.
- `GET /api/admin/nvidia/keys` returns `{ configured, count }` only — no key prefixes.
- `/api/ready` stays public for DigitalOcean health checks.

## Instagram

Claw Instagram tools use Composio first. If that path is disconnected or fails, the same operation retries through the direct Instagram Graph connector. DMs stay inside Meta's 24-hour window.

## Claw

Left-nav operator chat on Bitdeer (`CLAW_NVIDIA_MODEL`, default `mistralai/Mistral-Large-3-675B-Instruct-2512`). Set `STEEL_API_KEY` for public-web research. Local and private scrape targets are rejected.

## Claw Computer

Live Chromium the operator can watch and take over. Passwords, MFA, CAPTCHA, passkeys, and payments pause the agent. `DIGITALOCEAN_TOKEN` is orchestrator-only.

## Claw Swarm

`POST /api/swarm` `op=spawn` with `goal` (admin session required). Optional `runner=aion` sends the worker through Aion-Brain.

## Cursor Cloud Agents (via Aion-Brain)

CCFL only proxies. Brain owns `CURSOR_API_KEY` and `POST /api/cursor/launch`. Missing Brain → Trinity **HOLD**. See `docs/CURSOR_CLOUD_AGENTS.md`.

## Local setup

```bash
cp .env.example .env
npm install
npm run token:key
# paste the generated base64 value into APP_ENCRYPTION_KEY
# set ADMIN_PASSWORD (≥8 chars, not 1234) and SESSION_SECRET (≥32 chars)
npm run dev
```

Open `http://localhost:3000/login`, sign in, then use **Claw** or **Settings**.

## DigitalOcean

Dockerfile + `/app/data` for SQLite. Configure secrets: `ADMIN_PASSWORD`, `SESSION_SECRET`, `APP_ENCRYPTION_KEY`. `PUBLIC_BASE_URL` must be the public https hostname so session cookies are `Secure`. Health check: `/api/ready`.

## AI maintainer instructions

1. Never hard-code, print, commit, or return secrets.
2. Do not add video generation, multi-shot, extension, or stitch endpoints unless the owner explicitly restores that product.
3. `requireAdmin()` must stay a real session/token check. Tests in `tests/unit/auth.test.ts` must fail if it becomes `return true`.
4. Keep prompt/tool work server-side. Validate enums and sizes.
5. Generated or uploaded file endpoints remain authenticated.
6. Maintain TypeScript strict mode and shadcn-compatible `/components/ui` structure.
