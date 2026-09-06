#!/usr/bin/env bash
# Playwright CI webServer.
# Next standalone binds to process.env.HOSTNAME (default 0.0.0.0). GitHub
# Actions sets HOSTNAME to the runner name, so a poll of 127.0.0.1:3000
# never connects. `next start` also warns it does not work with
# output: "standalone" — use the standalone server.js after copying assets.
# The verify job sets NODE_ENV=test; production start needs production.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
export HOSTNAME=127.0.0.1
export PORT="${PORT:-3000}"
export NODE_ENV=production
if [[ ! -f .next/standalone/server.js ]]; then
  echo "e2e-webserver: missing .next/standalone/server.js (run npm run build first)" >&2
  exit 1
fi
mkdir -p .next/standalone/.next
cp -R .next/static .next/standalone/.next/static
if [[ -d public ]]; then
  rm -rf .next/standalone/public
  cp -R public .next/standalone/public
fi
echo "e2e-webserver: standalone bind ${HOSTNAME}:${PORT} NODE_ENV=${NODE_ENV}" >&2
exec node .next/standalone/server.js
