#!/usr/bin/env bash
# Playwright CI webServer. Values below are deterministic TEST-ONLY defaults;
# production secrets remain in DigitalOcean and are never committed.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
export HOSTNAME=127.0.0.1
export PORT="${PORT:-3000}"
export NODE_ENV=production
export ADMIN_PASSWORD="${ADMIN_PASSWORD:-playwright-admin-password}"
export SESSION_SECRET="${SESSION_SECRET:-playwright-session-secret-32-bytes-minimum}"
export APP_ENCRYPTION_KEY="${APP_ENCRYPTION_KEY:-MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=}"
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
