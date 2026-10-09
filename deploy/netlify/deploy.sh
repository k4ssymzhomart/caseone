#!/usr/bin/env bash
# Rota on Netlify (the Vercel script's twin, for when the Vercel account is out of daily deployments).
# Landing + web panel at /, the PWA at /app/ once apps/mobile/dist-web exists. Static upload of local builds;
# the backend stays on hosted Supabase.
# Once: npx -y netlify-cli login
# Then: deploy/netlify/deploy.sh              production (https://<site>.netlify.app)
#       deploy/netlify/deploy.sh preview      draft URL only
# SITE_NAME (default rota-naryad) picks the site; SITE_URL=https://<domain> makes og:image absolute.
set -euo pipefail
cd "$(dirname "$0")/../.."
SITE_NAME="${SITE_NAME:-rota-naryad}"
OUT=deploy/netlify/dist/site
mkdir -p "$OUT"
find "$OUT" -mindepth 1 -maxdepth 1 -exec rm -rf {} +

MODE="$( { grep -hs '^VITE_API_MODE=' apps/web/.env.production.local apps/web/.env.local || true; } | head -1 | cut -d= -f2 | tr -d "\"' ")"
[ "$MODE" = supabase ] || { echo "VITE_API_MODE is '${MODE:-unset}'; the jury build needs supabase (apps/web/.env.local)" >&2; exit 1; }

npm run build:web
cp -R apps/web/dist/. "$OUT/"
if [ -z "${SKIP_APP:-}" ] && [ -f apps/mobile/dist-web/index.html ]; then
  mkdir -p "$OUT/app" && cp -R apps/mobile/dist-web/. "$OUT/app/"
fi
cp deploy/netlify/_redirects deploy/netlify/_headers "$OUT/"
if [ -n "${SITE_URL:-}" ]; then
  perl -pi -e "s#content=\"/og\.jpg\"#content=\"${SITE_URL%/}/og.jpg\"#g" "$OUT/index.html"
fi

MB="$(du -sm "$OUT" | cut -f1)"
[ "$MB" -lt 95 ] || { echo "$OUT is ${MB} MB; keep the APK off this host" >&2; exit 1; }

# Run the CLI from a neutral folder: inside the npm workspace it stops to ask which package to use.
NLDIR="$(mktemp -d)"
ABS_OUT="$(cd "$OUT" && pwd)"
nl() { (cd "$NLDIR" && npx -y netlify-cli@latest "$@"); }
site_id() { nl sites:list --json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const l=JSON.parse(s);const x=l.find(v=>v.name===process.argv[1]);process.stdout.write(x?x.id:"")}catch{}})' "$SITE_NAME"; }

SITE_ID="$(site_id)"
if [ -z "$SITE_ID" ]; then
  nl sites:create --name "$SITE_NAME" --disable-linking >/dev/null
  SITE_ID="$(site_id)"
fi
[ -n "$SITE_ID" ] || { echo "could not create or find the Netlify site $SITE_NAME" >&2; exit 1; }

if [ "${1:-}" = preview ]; then nl deploy --dir "$ABS_OUT" --site "$SITE_ID"; else nl deploy --dir "$ABS_OUT" --site "$SITE_ID" --prod; fi
