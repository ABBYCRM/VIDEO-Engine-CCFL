# Claw and Aion-Brain

Claw calls the running Aion-Brain API with the same keys (`AION_BASE_URL` +
`AION_API_KEY`). For work that must use tools, Claw prefers
`POST /api/claw/execute` (`aion_execute`; alias `/api/agent/run`).
`aion_status` and `aion_consult` stay advice-only: consult still posts
`/api/chat` without `"agentic"` unless the caller sets `agentic: true`.
`previous_tool_results` are the only Aion evidence; Claw never marks a
local execution verified from Aion prose. This is separate from browsing
its GitHub repository.

Local Claw also registers GDY OSINT (`gdy_search`, `gdy_rag_context`,
`gdy_categories`, `gdy_tools`) and public `arxiv_search`. GDY uses
server-only `GDY_API_KEY` / `GDY_API_KEY_ALT` with `GDY_API_BASE` or
`GDY_BASE_URL` and fails soft when unconfigured. These tools are available
to native `tool_calls` and the SELF_STATE ACTION step on the local
registry; Aion execute acceptance still uses documented brain tools
(`web_search` / `steel_browser`) and is not weakened. Aion is not a new entry in the NVIDIA model picker.
Each Claw conversation gets a distinct Aion session. Only the question and
context passed to the tool are sent; chat history is not automatically copied.

`aion_curriculum` builds the 42-topic SQM curriculum through Aion's real skill
corpus and saves the full Markdown or JSON document in Claw's file panel.
Ask: `Use Aion-Brain to build my Python, GitHub and DigitalOcean curriculum.`

## Existing local installation (Ubuntu or Ubuntu inside WSL)

```bash
cd ~/VIDEO-Engine-CCFL && git fetch origin && git switch main && git pull --ff-only origin main && bash scripts/setup-aion-local.sh
```

The script preserves `.env` and the existing Claw data volume. It creates a
private `.aion.env`, reusing an NVIDIA key from `.env` when possible, otherwise
prompting without displaying the key. It creates separate Aion user/admin keys,
builds the pinned Aion source, and checks authenticated reachability from Claw.
The check confirms configuration and connectivity, not NVIDIA quota or inference;
ask `Check Aion status, then ask Aion-Brain to introduce itself` to verify inference.
Echo-only responses are explicitly marked as test mode.

Open http://localhost:3000/claw. Aion has no published host port. Claw binds
only to localhost. Aion data and reports persist in separate Docker volumes.
No Windows folders or Docker socket are mounted into Aion.

Repeat the same script for updates. Manage this stack with:

```bash
sudo docker compose --env-file .aion.env -f docker-compose.aion.yml ps
sudo docker compose --env-file .aion.env -f docker-compose.aion.yml logs --tail=60
sudo docker compose --env-file .aion.env -f docker-compose.aion.yml stop
```

Do not add `down -v` unless you intend to delete saved data. Keep `.aion.env`
private and include it in secure backups. To change the provider model or key,
edit that file locally and rerun the script. Never paste it into chat or commits.

## Hosted Claw (including DigitalOcean)

Deploy Aion separately and set server-only `AION_BASE_URL` (HTTPS origin) and
`AION_API_KEY` on the Claw deployment. The key must match a regular key in the
Aion server's `AION_API_KEYS`; its admin keys stay on Aion. Redeploy Claw, then
ask for `aion_status`. A hosted Claw cannot reach the private Docker hostname
on your PC. This local setup does not configure the DigitalOcean deployment.
Do not expose the local Claw server or forward Aion's port to solve that.
