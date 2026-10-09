// Service worker for the PWA at /app/ (DEPLOY_VM.md §4): precaches the exported app shell, no runtime caching
// (Supabase requests always go to the network). Run by `npm run export:web` after `expo export`.
module.exports = {
  globDirectory: 'dist-web/',
  globPatterns: ['**/*.{js,html,css,ttf,otf,woff2,png,svg,ico,json,wav}'],
  globIgnores: ['sw.js', 'workbox-*.js'],
  swDest: 'dist-web/sw.js',
  modifyURLPrefix: { '': '/app/' },
  navigateFallback: '/app/index.html',
  maximumFileSizeToCacheInBytes: 6291456,
  skipWaiting: true,
  clientsClaim: true,
  cleanupOutdatedCaches: true,
};
