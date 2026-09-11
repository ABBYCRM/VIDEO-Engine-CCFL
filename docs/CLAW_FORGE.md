# Claw Forge

Self-hosted managed Chromium control plane. Steel-like **sessions + CDP + persistent profile + scrape + fingerprint lab**. Not Steel Cloud. Not a CAPTCHA farm.

## What it is

- Real Playwright Chromium sessions (`POST /api/forge` `op=create`)
- Persistent cookies / localStorage on disk
- Loopback CDP (`127.0.0.1` only)
- `scrape` → markdown + links on public URLs
- `probe` → live fingerprint + educational anomaly score
- Coherence init strips ChromeDriver `cdc_` leftovers
- Lab profile pins `hardwareConcurrency=8` / `deviceMemory=8` and copies them into Workers

## What it is not

- No CAPTCHA token injection, worker farms, or auto-click of puzzle tiles
- No residential proxy rotation to evade blocks
- No claim of undetectable stealth
- `navigator.webdriver` stays whatever Chromium reports

Third-party puzzles **pause for a human on the same session**. Steel Cloud remains an optional separate solver (`computer_search` / Skip-puzzle).

## API

`GET /api/forge` — live sessions + contract  
`POST /api/forge` `{ op }`

| op | notes |
|---|---|
| create | `{ stealth: coherence\|lab\|off, persist, blockAds, width, height }` |
| navigate | `{ id, url }` public http(s) only |
| scrape | `{ url, sessionId?, delayMs, screenshot }` |
| probe | `{ sessionId?, url? }` |
| screenshot / cookies / handoff / resume / release | session-scoped |

`solve_captcha` and `inject_token` return 400.

## Claw tools

`forge_session` `forge_scrape` `forge_probe`

## Policy

Private/metadata URLs are denied. CAPTCHA copy on a page triggers `HANDOFF`. Claw must not click tiles.
