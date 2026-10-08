#!/usr/bin/env bash
# Build Rota on the Mac and ship it to the Windows VM (see docs/DEPLOY_VM.md).
# Usage: deploy/vm/deploy.sh init | caddy | web | app | apk <file.apk> | smoke | all
# Needs the ssh host alias "rota-vm" in ~/.ssh/config (DEPLOY_VM.md §1).
set -euo pipefail
cd "$(dirname "$0")/../.."
VM="${ROTA_VM:-rota-vm}"
HOST="${ROTA_HOST:-vds39302.vpsza500.kz}"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
STAMP="$(date +%Y%m%d%H%M%S)"

ship() { # $1 local dir with index.html, $2 web|app
  [ -f "$1/index.html" ] || { echo "no index.html in $1" >&2; exit 1; }
  (cd "$1" && zip -qr -X "$TMP/$2.zip" .)
  scp -q "$TMP/$2.zip" "$VM:C:/srv/naryad/incoming/$2-$STAMP.zip"
  ssh "$VM" "C:\\srv\\bin\\swap.ps1 -Project naryad -Name $2 -Zip C:\\srv\\naryad\\incoming\\$2-$STAMP.zip"
}

copy_config() {
  scp -q deploy/vm/Caddyfile "$VM:C:/srv/caddy/Caddyfile"
  scp -q deploy/vm/routes/naryad.caddy "$VM:C:/srv/caddy/routes/naryad.caddy"
  scp -q deploy/vm/swap.ps1 "$VM:C:/srv/bin/swap.ps1"
  scp -q deploy/vm/install-caddy.ps1 "$VM:C:/srv/bin/install-caddy.ps1"
}

init() { # one time, after bootstrap.ps1 ran on the VM
  copy_config
  ssh "$VM" "C:\\srv\\bin\\install-caddy.ps1"
}

push_caddy() {
  copy_config
  ssh "$VM" "C:\\srv\\caddy\\caddy.exe validate --config C:\\srv\\caddy\\Caddyfile; if (\$LASTEXITCODE -eq 0) { C:\\srv\\caddy\\caddy.exe reload --config C:\\srv\\caddy\\Caddyfile }"
}

build_web() {
  npm run build:web
  ship apps/web/dist web
}

build_app() {
  (cd apps/mobile && rm -rf dist-web \
    && EXPO_BASE_URL=/app npx expo export -p web --output-dir dist-web \
    && npx workbox-cli generateSW workbox-config.cjs)
  ship apps/mobile/dist-web app
}

ship_apk() {
  [ -f "${1:-}" ] || { echo "usage: $0 apk path/to/build.apk" >&2; exit 1; }
  scp -q "$1" "$VM:C:/srv/naryad/downloads/rota.apk"
}

smoke() {
  for p in /healthz / /login /board /app/ /app/manifest.json /download/rota.apk; do
    printf '%-22s ' "$p"
    curl -s -o /dev/null -w '%{http_code}  %{content_type}  %{size_download}B\n' "https://$HOST$p"
  done
}

case "${1:-}" in
  init) init ;;
  caddy) push_caddy ;;
  web) build_web ;;
  app) build_app ;;
  apk) ship_apk "${2:-}" ;;
  smoke) smoke ;;
  all) push_caddy; build_web; build_app; smoke ;;
  *) echo "usage: $0 init|caddy|web|app|apk <file>|smoke|all" >&2; exit 1 ;;
esac
