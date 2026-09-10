# Claw Computer

Grok-style live Chrome for Claw.

- One Chromium process per session
- Agent and human never type at the same time (`control_owner`)
- CAPTCHA / password / MFA / payment → `computer_handoff` on the **same** window
- Steel scrape is unchanged until this path is the default in production

## Tools

`computer_open` `computer_status` `computer_click` `computer_type` `computer_keypress` `computer_scroll` `computer_handoff` `computer_resume`

## Local

```bash
npx playwright install chromium
npm run dev
# open /computer and /claw
```

## DigitalOcean

Golden snapshot of Ubuntu + Chromium + this worker. Orchestrator (`lib/browser-computer/digitalocean.ts`) creates/destroys Droplets. Claw tools never see `DIGITALOCEAN_TOKEN`.
