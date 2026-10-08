#!/usr/bin/env bash
# Rota on Vercel, no VPS: landing + web panel at /, the PWA at /app/ once apps/mobile/dist-web exists.
# Ships the local builds as static files, so Vercel never builds the monorepo. The backend stays on hosted Supabase.
# Once: npx vercel login
# Then: deploy/vercel/deploy.sh            production (public *.vercel.app domain)
#       deploy/vercel/deploy.sh preview    preview URL only
# SITE_URL=https://<production domain> deploy/vercel/deploy.sh   makes og:image absolute for link previews.
set -euo pipefail
cd "$(dirname "$0")/../.."
OUT=deploy/vercel/dist/rota-naryad   # the folder name becomes the Vercel project name; dist/ is git-ignored
mkdir -p "$OUT"
find "$OUT" -mindepth 1 -maxdepth 1 ! -name .vercel -exec rm -rf {} +   # keep the project link between runs

MODE="$( { grep -hs '^VITE_API_MODE=' apps/web/.env.production.local apps/web/.env.local || true; } | head -1 | cut -d= -f2 | tr -d "\"' ")"
[ "$MODE" = supabase ] || { echo "VITE_API_MODE is '${MODE:-unset}'; the jury build needs supabase (apps/web/.env.local)" >&2; exit 1; }

npm run build:web
cp -R apps/web/dist/. "$OUT/"
if [ -f apps/mobile/dist-web/index.html ]; then
  mkdir -p "$OUT/app" && cp -R apps/mobile/dist-web/. "$OUT/app/"
fi
cp deploy/vercel/vercel.json "$OUT/vercel.json"
if [ -n "${SITE_URL:-}" ]; then
  perl -pi -e "s#content=\"/og\.jpg\"#content=\"${SITE_URL%/}/og.jpg\"#g" "$OUT/index.html"
fi

MB="$(du -sm "$OUT" | cut -f1)"
[ "$MB" -lt 95 ] || { echo "$OUT is ${MB} MB; Vercel Hobby CLI uploads stop at 100 MB, keep the APK off this host" >&2; exit 1; }

if [ "${1:-}" = preview ]; then npx vercel deploy "$OUT" --yes; else npx vercel deploy "$OUT" --prod --yes; fi
