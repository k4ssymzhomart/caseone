#!/usr/bin/env bash
# Vercel's git build (root vercel.json): every push to main deploys the landing and web panel at / and the PWA at /app/.
# The public values (VITE_*, EXPO_PUBLIC_*: the Supabase URL and the publishable key) come from the Vercel project's
# environment; locally the builds read apps/web/.env.local and apps/mobile/.env as usual.
set -euo pipefail
cd "$(dirname "$0")/../.."
if [ -n "${VERCEL:-}" ]; then
  [ "${VITE_API_MODE:-}" = supabase ] || { echo "VITE_API_MODE must be supabase in the Vercel project env" >&2; exit 1; }
  [ "${EXPO_PUBLIC_API_MODE:-}" = supabase ] || { echo "EXPO_PUBLIC_API_MODE must be supabase in the Vercel project env" >&2; exit 1; }
fi
OUT=deploy/vercel/out
rm -rf "$OUT"
mkdir -p "$OUT/app"

npm run build:web
npm run export:web -w apps/mobile
cp -R apps/web/dist/. "$OUT/"
cp -R apps/mobile/dist-web/. "$OUT/app/"

# Absolute og:image for link previews on the production domain.
SITE_URL="${SITE_URL:-${VERCEL_PROJECT_PRODUCTION_URL:+https://$VERCEL_PROJECT_PRODUCTION_URL}}"
if [ -n "$SITE_URL" ]; then
  perl -pi -e "s#content=\"/og\.jpg\"#content=\"${SITE_URL%/}/og.jpg\"#g" "$OUT/index.html"
fi
echo "built $(du -sh "$OUT" | cut -f1) into $OUT"
