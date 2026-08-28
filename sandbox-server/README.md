# Coding Agent sandbox server

An external, network-isolated service that VIDEO-Engine's Coding Agent
(`lib/coding-agent/client.ts`) calls to run commands. It holds none of
VIDEO-Engine's secrets — its only credential is its own bearer token.

Every command runs in a fresh, throwaway Docker container bound to a
per-workspace volume. Network egress is off by default.

**This folder lives inside the main VIDEO-Engine-CCFL repo for version
control convenience, but it is a completely separate deployable unit.**
It is never built, started, or imported by the Next.js app — nothing in
`app/` or `lib/` references anything under `sandbox-server/`, and the
root `package.json` has no npm workspace pointing at it. It must be
deployed to its **own** DigitalOcean resource, never bundled into or run
alongside the main app's container. Sharing a repo is fine (same commit
history); sharing a runtime, an IP, or an env-var set is not.

## 1. Deploy to DigitalOcean

### Option A — a Droplet (recommended: full control over Docker)

1. Create a Droplet: **Marketplace → Docker** image (Docker pre-installed),
   smallest size is fine to start (1 vCPU / 1–2GB RAM).
2. SSH in and clone just this repo (the sandbox only needs this one
   subfolder, but cloning the whole repo is simplest):
   ```bash
   git clone https://github.com/ABBYCRM/VIDEO-Engine-CCFL.git
   cd VIDEO-Engine-CCFL/sandbox-server
   cp .env.example .env
   openssl rand -hex 32   # paste the result as SANDBOX_TOKEN in .env
   apt-get update && apt-get install -y docker-compose-plugin   # if not already present
   docker compose up -d --build
   curl -H "Authorization: Bearer $(grep SANDBOX_TOKEN .env | cut -d= -f2)" http://localhost:8080/health
   ```
3. **Firewall it** (DigitalOcean Networking → Firewalls): allow inbound
   TCP 8080 **only** from VIDEO-Engine's server IP. Block everything else.
4. Note the droplet's **public** IP — that becomes
   `CODING_SANDBOX_URL=http://<ip>:8080` on the main VIDEO-Engine app
   (see step 3 below; private VPC IPs won't work here — see the note at
   the bottom).

### Option B — DigitalOcean App Platform, scoped to this subfolder

App Platform supports deploying one component from a subdirectory of a
monorepo: when creating the App, point its **Source Directory** at
`sandbox-server/` in this repo. However, App Platform containers don't
get access to a Docker socket, so the Docker-out-of-Docker approach in
`server.js` won't run there as-is — you'd need a different `server.js`
that executes commands directly in its own container's filesystem
instead of spawning sibling containers (weaker isolation between
successive commands, but still a separate, secret-free service from
VIDEO-Engine). Ask if you want that variant; the Droplet path above is
the one this `server.js` is built for.

## 2. Wire it back into VIDEO-Engine

In VIDEO-Engine's environment (DigitalOcean App Platform env vars for the
*main* app component, or a `.env` if self-hosting), set:

```
CODING_SANDBOX_URL=http://<sandbox-droplet-public-ip>:8080
CODING_SANDBOX_TOKEN=<the same SANDBOX_TOKEN you generated above>
```

Redeploy VIDEO-Engine. `isCodingSandboxConfigured()` now returns true, and
Claw's `coding_new_session` / `coding_run` / `coding_read_file` /
`coding_write_file` / `coding_list_files` tools become live.

**Note on private networking:** `lib/coding-agent/client.ts` refuses to
call a sandbox host on `10.x.x.x`, `172.16-31.x.x`, or `192.168.x.x` — all
of RFC1918, checked against the literal IP. DigitalOcean VPC private IPs
are always in one of these ranges (typically `10.x.x.x`), so pointing
`CODING_SANDBOX_URL` at the droplet's VPC-private address will get
rejected by this guard, not silently allowed. Use the droplet's public IP
+ the Cloud Firewall rule from step 1 instead — that's the supported path
above.

## 3. NVIDIA models — where they actually fit (optional)

You don't need a second NVIDIA model for this to work: Claw already runs on
NVIDIA NIM (`CLAW_NVIDIA_MODEL`, default
`nvidia/nemotron-3.5-lightning-30b-a3b`) and is what decides *which*
commands to send to the sandbox — the sandbox itself has no model, it's
just hands.

If you specifically want a code-specialized model instead of Claw's general
chat model for planning coding tasks, browse code-capable models at
https://build.nvidia.com/models and swap `CLAW_NVIDIA_MODEL` (or add a
second model id used only when the Coding Agent's tools are invoked) —
that's a small addition to `lib/nvidia/models.ts`'s existing model-id
registry, not something this sandbox server needs to know about.

## Security notes (read before deploying)

- The server mounts the host's `/var/run/docker.sock` to spawn worker
  containers — that's effectively root-equivalent control of the droplet.
  Dedicate this droplet to this one purpose. Don't run anything else on it.
- `SANDBOX_ALLOW_NETWORK` defaults to `false` (worker containers have no
  network). Only flip it on if you need `npm install`/`pip install` inside
  the sandbox, and understand that's the one setting that lets a sandboxed
  command reach the internet.
- Rotate `SANDBOX_TOKEN` if it's ever exposed; it's the only thing standing
  between "authenticated VIDEO-Engine request" and "anyone who can reach
  port 8080."
- Per-command memory/CPU/time limits are enforced (`SANDBOX_MEMORY_MB`,
  `SANDBOX_CPUS`, `SANDBOX_COMMAND_TIMEOUT_MS`) — tune them down if this is
  a small droplet.
- This folder's own `package.json`/`Dockerfile` are self-contained: the
  main app's `npm install`/`npm run build`/Docker build never touch this
  directory (no root npm workspace references it, and its files are excluded
  from the main app's Docker build context — see `.dockerignore`).
