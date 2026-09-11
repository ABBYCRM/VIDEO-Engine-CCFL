# Claw Computer

Live Chromium Claw can drive like a person. Version 1 is **one persistent Playwright worker**. DigitalOcean Droplet provisioning is ready (`lib/browser-computer/digitalocean.ts`) once a golden snapshot exists. The LLM never sees `DIGITALOCEAN_TOKEN`.

## Contract

- One Chromium process per session, persistent profile
- Agent and human never type at the same time (`control_owner`)
- CAPTCHA / password / MFA / payment → `computer_handoff` on the **same** window
- Uploads and downloads stay in the session folder. Downloaded files are not executed.
- Steel scrape is unchanged until this path is the default in production
- Claw Forge (`/forge`, `lib/forge`) is the self-hosted control plane: sessions, CDP, scrape, fingerprint lab. It does not farm CAPTCHAs.
- Claw Swarm (`/swarm`, `lib/swarm`) is the multi-agent planner/worker/leader runtime. It does not steal this Chrome session.

## Tools

`computer_open` `computer_look` / `computer_observe` `computer_status` `computer_search` `computer_click` `computer_type` `computer_fill` `computer_keypress` `computer_scroll` `computer_upload` `computer_download` `computer_handoff` `computer_resume`

`computer_click` accepts a visible `text` label (preferred) or snapshot `x,y`.

## Local

```bash
npx playwright install chromium
npm run dev
# open /computer and /claw
```

## DigitalOcean

Golden snapshot of Ubuntu + Chromium + this worker. Orchestrator creates/destroys Droplets. Claw tools never see `DIGITALOCEAN_TOKEN`.
