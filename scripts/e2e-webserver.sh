#!/usr/bin/env bash
# Playwright CI webServer. Next standalone / `next start` bind to
# process.env.HOSTNAME (default 0.0.0.0). GitHub Actions sets HOSTNAME to
# the runner name, so a poll of 127.0.0.1:3000 never connects.
# The verify job also sets NODE_ENV=test; production start needs production.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
export HOSTNAME=127.0.0.1
export PORT="${PORT:-3000}"
export NODE_ENV=production
echo "e2e-webserver: next start --hostname ${HOSTNAME} --port ${PORT} NODE_ENV=${NODE_ENV}" >&2
exec ./node_modules/.bin/next start --hostname 127.0.0.1 --port "${PORT}"
