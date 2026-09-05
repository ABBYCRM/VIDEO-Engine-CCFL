#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
command -v python3 >/dev/null || { echo 'Python 3 is required. Run sudo apt install python3'; exit 1; }
test -f .env || { echo 'Existing Claw .env not found. Run this from your installed Claw repository.'; exit 1; }
sudo docker compose version >/dev/null
umask 077
python3 - <<'PY'
import getpass, json, os, pathlib, re, secrets
target = pathlib.Path('.aion.env')
if target.exists():
    target.chmod(0o600)
    print('Reusing existing Aion configuration.')
else:
    values = {}
    for line in pathlib.Path('.env').read_text().splitlines():
        key, sep, value = line.strip().partition('=')
        if sep and not key.startswith('#'):
            values[key] = value.strip().strip('\"').strip("'")
    key = values.get('NVIDIA_API_KEY', '')
    if not key:
        try:
            keys = json.loads(values.get('NVIDIA_API_KEYS', '[]'))
            key = keys[0] if isinstance(keys, list) and keys else ''
        except (ValueError, TypeError):
            pass
    if not isinstance(key, str) or not re.fullmatch(r'nvapi-[A-Za-z0-9_-]+', key):
        key = getpass.getpass('Paste a current NVIDIA API key (hidden), then press Enter: ').strip()
        key = key.removeprefix('Bearer ').strip()
    if not re.fullmatch(r'nvapi-[A-Za-z0-9_-]+', key):
        raise SystemExit('Invalid NVIDIA key format. No configuration was written.')
    with target.open('x') as f:
        f.write('AION_API_KEY=' + secrets.token_hex(32) + '\n')
        f.write('AION_ADMIN_KEY=' + secrets.token_hex(32) + '\n')
        f.write('AION_NVIDIA_API_KEY=' + key + '\n')
        f.write('AION_PRIMARY_MODEL=nvidia/nemotron-3.5-lightning-30b-a3b\n')
    print('Created private Aion configuration. Existing Claw settings are preserved.')
existing = target.read_text()
if not any(line.startswith('N8N_MCP_TOKEN=') and line.split('=',1)[1] for line in existing.splitlines()):
    token = getpass.getpass('Paste n8n MCP access token (hidden; Enter skips n8n): ').strip().removeprefix('Bearer ').strip()
    if token:
        api_key = getpass.getpass('Paste n8n public API key (hidden; Enter skips public API): ').strip()
        if not re.fullmatch(r'[A-Za-z0-9_.-]+', token) or (api_key and not re.fullmatch(r'[A-Za-z0-9_.-]+', api_key)):
            raise SystemExit('Invalid n8n token format. Paste the raw token, without quotes or Markdown escapes.')
        with target.open('a') as f:
            f.write('\nN8N_MCP_TOKEN=' + token + '\n')
            if api_key: f.write('N8N_API_KEY=' + api_key + '\n')
PY
compose=(sudo docker compose --env-file .aion.env -f docker-compose.aion.yml)
"${compose[@]}" up -d --build
echo 'Checking the connection from Claw to Aion-Brain...'
ready=false
for attempt in {1..30}; do
  if "${compose[@]}" exec -T video-engine node -e '
    Promise.all([
      fetch("http://127.0.0.1:3000/api/ready", {signal:AbortSignal.timeout(5000)}).then(r => {if(!r.ok)throw Error("Claw starting")}),
      fetch(process.env.AION_BASE_URL+"/api/state", {headers:{"X-AION-Key":process.env.AION_API_KEY},signal:AbortSignal.timeout(5000)})
        .then(async r => {if(!r.ok)throw Error("Aion HTTP "+r.status);const s=await r.json();if(s.app!=="aion-brain" || !s.ok || !s.providers.some(p=>p!=="echo"))throw Error("Aion provider not configured")})
    ]).catch(() => process.exit(1));
  ' >/dev/null 2>&1; then ready=true; break; fi
  sleep 2
done
if [ "$ready" != true ]; then
  echo 'Connection check failed. Run: sudo docker compose --env-file .aion.env -f docker-compose.aion.yml logs --tail=60'
  exit 1
fi
echo 'Claw and Aion-Brain are running and the authenticated API connection works.'
echo 'Open http://localhost:3000/claw and refresh with Ctrl+F5.'
echo 'Ask: Check Aion status, then ask Aion-Brain to introduce itself.'
echo 'The first consultation verifies that the NVIDIA key and model work.'
echo 'For n8n, ask: Check my n8n connection through Aion-Brain and list available tools.'
