# Deploy · the jury opens one link, nothing runs on the laptop

> **Status 2026-10-09:** no VM yet. Until it exists, the jury link is Vercel: `deploy/vercel/deploy.sh` ships the same layout (`/` landing and panel, `/app/` PWA) as static files from local builds. §3 (web env) and §4 (PWA) apply as written; §1, §2 and the Caddy parts wait for the VM. The APK stays on the EAS link (Vercel Hobby uploads stop at 100 MB).

The team's VM serves Rota to the jury: the landing and web panel, the mobile app as a PWA in the browser, and the Android APK. The database, Realtime, Storage, Edge Functions and cron stay on the hosted Supabase project `wcjklkpkuhxgfdtbwbuk`. No Docker anywhere: not on the laptop, not on the VM.

| | |
| --- | --- |
| VM | `vds39302`, Windows Server 2022, 2 vCPU, 2 GB RAM, 25 GB disk |
| Address | `vds39302.vpsza500.kz` → `93.170.73.222` |
| Panel | `https://vps.equhost.kz/vm/manager/` (VNC console, reboot, reinstall) |
| Access for agents | SSH with a key, host alias `rota-vm`. The Administrator password is never given to an agent and never written to a file. |

Public URLs after this phase:

| URL | What |
| --- | --- |
| `https://vds39302.vpsza500.kz/` | `apps/web`: landing at `/` once the `landing` branch is merged, web panel at `/login` and the panel routes |
| `https://vds39302.vpsza500.kz/app/` | `apps/mobile` exported for the web: the PWA (master and worker in any browser, iPhone included) |
| `https://vds39302.vpsza500.kz/download/rota.apk` | Android APK (full experience: push, siren, camera) |
| `https://vds39302.vpsza500.kz/healthz` | `ok` |

Two projects share this VM. Rota lives in `C:\srv\naryad\` and `C:\srv\caddy\routes\naryad.caddy`, served at the root of the domain. Another project gets its own `C:\srv\<name>\`, its own `routes\<name>.caddy` and its own prefix (`/<name>/`). Never edit another project's folder or routes file.

Files in this repo: `deploy/vm/bootstrap.ps1` (one-time, run by the user over RDP), `deploy/vm/install-caddy.ps1`, `deploy/vm/swap.ps1`, `deploy/vm/Caddyfile`, `deploy/vm/routes/naryad.caddy`, `deploy/vm/deploy.sh`. The Caddy config was validated with Caddy v2.10.2 and its routes were tested (SPA fallbacks, `/app` redirect, APK headers, cache headers).

---

## 0. Free the laptop

1. `docker ps` and `supabase status`. If a local Supabase stack runs: `supabase stop --no-backup`. Quit Docker Desktop and turn off "Start Docker Desktop when you sign in".
2. All app work points at the hosted project (`EXPO_PUBLIC_API_MODE=supabase`, `VITE_API_MODE=supabase`).
3. SQL tests: no Docker. If they must run, use Postgres.app (native, light) on `localhost:5432` with a throwaway database. Never run destructive tests against the hosted project.
4. Builds stay on the Mac (`vite build`, `expo export -p web` are light). The APK builds in the cloud (§5), not with local Gradle.

## 1. SSH access (agent prepares, user runs one script)

1. Create a dedicated key: `ssh-keygen -t ed25519 -N '' -C rota-vm -f ~/.ssh/rota_vm_ed25519` (skip if it exists).
2. Add to `~/.ssh/config`:

```
Host rota-vm
  HostName 93.170.73.222
  User Administrator
  IdentityFile ~/.ssh/rota_vm_ed25519
  IdentitiesOnly yes
  ServerAliveInterval 30
```

3. Write `deploy/vm/bootstrap.generated.ps1`: a copy of `bootstrap.ps1` with `__PUBKEY__` replaced by the one line of `~/.ssh/rota_vm_ed25519.pub`. Add `deploy/vm/*.generated.ps1` to `.gitignore`. Copy it to the clipboard (`pbcopy < deploy/vm/bootstrap.generated.ps1`).
4. **Stop and ask the user** to do this, then wait:
   - Open the VM over RDP (Windows App / Microsoft Remote Desktop: `93.170.73.222`, user `Administrator`), or the VNC console in the panel.
   - Start → PowerShell → right click → Run as administrator → paste → Enter. It installs OpenSSH, key-only login, opens 22/80/443, creates `C:\srv`.
   - Change the Administrator password: `net user Administrator *`.
5. Check: `ssh rota-vm hostname` prints the VM name, `ssh rota-vm "Get-PSDrive C | Select-Object Used,Free"` shows free space.
6. If `scp` complains about Windows paths, use `scp -O` (legacy protocol) or the `/C:/srv/...` form, and adjust `deploy.sh` once.

## 2. Caddy: HTTPS front door (one time)

1. `dig +short vds39302.vpsza500.kz` must print `93.170.73.222`. If not, change the site address in `deploy/vm/Caddyfile` to `93-170-73-222.sslip.io` and use that host everywhere below.
2. `deploy/vm/deploy.sh init`: copies the Caddyfile, `routes/naryad.caddy`, `swap.ps1`, `install-caddy.ps1`, then installs the latest Caddy v2 as the Windows service `caddy` (auto start, restart on failure). Let's Encrypt issues the certificate on the first request; certificates live in `C:\srv\caddy\data`.
3. If ports 80/443 are taken (the script says so), stop the owner (IIS: `Stop-Service W3SVC; Set-Service W3SVC -StartupType Disabled`).
4. `curl -sS https://vds39302.vpsza500.kz/healthz` → `ok` with a valid certificate (no `-k`).
5. Later config changes: edit the files in `deploy/vm/`, then `deploy/vm/deploy.sh caddy` (validate, then hot reload).

## 3. Web panel and landing (`/`)

1. `apps/web/.env.production.local` (untracked): `VITE_API_MODE=supabase`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`. Public values only, from `.secrets/supabase.env`.
2. If the `landing` branch is merged, set `apps/web/src/landing/links.ts`: `apk: '/download/rota.apk'`, `panel: '/login'`, and add `app: '/app/'` with a button «Открыть в браузере» next to «Скачать APK» (hero and final CTA).
3. `deploy/vm/deploy.sh web` (builds, zips, uploads, swaps; the previous release stays as `web.prev`).
4. Rollback: `ssh rota-vm "C:\srv\bin\swap.ps1 -Project naryad -Name web -Rollback"`.

## 4. The PWA at `/app/` (owned by lane A: it touches `apps/mobile`)

Goal: a jury member on any phone or laptop opens `/app/`, signs in with a demo account and walks the master and worker flows without installing anything. The APK stays the full experience.

Build:
- `app.config.ts`: `web: { output: 'single', bundler: 'metro', favicon: './assets/icon.png' }`, and `experiments.baseUrl` taken from `process.env.EXPO_BASE_URL` only when it is set (the export sets `/app`; native builds and the dev server stay at the root).
- `npx expo customize public/index.html`, then in its `<head>`: `<link rel="manifest" href="/app/manifest.json">`, `theme-color` `#000000`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style` `black-translucent`, `apple-touch-icon` (180 px from the app icon), `viewport-fit=cover`, and the service worker registration on `load`: `navigator.serviceWorker.register('/app/sw.js', { scope: '/app/' })`.
- `public/manifest.json`: name «Rota», short_name «Rota», `start_url` and `scope` `/app/`, `display` `standalone`, `background_color` and `theme_color` `#000000`, icons 192 and 512 (plus a maskable 512) generated from `packages/design/assets/app-icon/app-icon-1024.png` into `public/`.
- `workbox-config.cjs`: `globDirectory: 'dist-web/'`, `globPatterns: ['**/*.{js,html,css,ttf,otf,woff2,png,svg,ico,json,wav}']`, `globIgnores: ['sw.js', 'workbox-*.js']`, `swDest: 'dist-web/sw.js'`, `modifyURLPrefix: { '': '/app/' }`, `navigateFallback: '/app/index.html'`, `maximumFileSizeToCacheInBytes: 6291456`, `skipWaiting: true`, `clientsClaim: true`, `cleanupOutdatedCaches: true`. No runtime caching of Supabase requests.
- `deploy/vm/deploy.sh app` exports with `EXPO_BASE_URL=/app` into `apps/mobile/dist-web`, generates the service worker and ships it.

Web versions of native-only code, as platform files (`*.web.ts`), never `if` chains spread through screens:
- Push: no Expo push token on the web. New orders, emergencies and reports arrive through the existing Realtime notification hub and show as in-app toasts and the red emergency screen.
- Siren: Web Audio, unlocked by the first tap (the PIN pad counts); `navigator.vibrate` where the browser has it.
- Haptics: no-op.
- Photos: `expo-image-picker` (file input, camera on phones), compress with `expo-image-manipulator` or a canvas, `Blob` upload to Storage, SHA-256 with `crypto.subtle`, dHash from a 9×8 canvas. Metadata the browser does not give stays empty; the AI rules already treat missing metadata as a warning, not a failure.
- `expo-file-system` `File` API: not used on the web.
- Desktop: on wide screens the app renders in a centered 430 px column on black, so it reads as a phone.

Done when: `/app/` installs from Chrome (installable in Lighthouse), refresh on a deep link (`/app/order/164`) works, sign in as master 1001 / 1111 in one browser and worker 2001 / 1234 in another, issue an emergency order, the worker's red screen appears within seconds, accept → the master sees «Принят в работу», close with a photo → AI verdict arrives. Time box: 3 h. If a native module blocks the web export past the time box, ship `/` and the APK, hide «Открыть в браузере», and report the blocker.

## 5. The APK (`/download/rota.apk`)

1. Build in the cloud, not on the laptop: `cd apps/mobile && npx eas-cli build -p android --profile preview` (profile already in `eas.json`: APK, Supabase mode, demo accounts). It needs the user's Expo account (`npx eas-cli login`, ask the user) and a project id (`npx eas-cli init`; with `app.config.ts` it prints the id, put it into `extra.eas.projectId`). Start it first: the free queue can take a while.
2. Push on the APK needs FCM: `google-services.json` present and the FCM V1 service account key uploaded (`npx eas-cli credentials`). If FCM is not set yet, the APK still works through Realtime while open; report it.
3. Download the build and `deploy/vm/deploy.sh apk path/to/build.apk`.

## 6. Supabase for browsers

- Every Edge Function a browser calls (`ai-verify` and any other called from the panel or the PWA) answers `OPTIONS` and sends the headers from `_shared/cors.ts` on every response, errors included. Check from a browser at `https://vds39302.vpsza500.kz` that `ai-verify` works with no CORS error.
- Authentication → URL Configuration: Site URL `https://vds39302.vpsza500.kz`, redirect URLs `https://vds39302.vpsza500.kz/**`.
- The link is public: keep the LLM budget guard on (`BUDGET_EXCEEDED` falls back to rules), and run `demo_reset()` right before sending the link to the jury.

## 7. Verify (from the Mac, not from the VM)

- `deploy/vm/deploy.sh smoke`: `/healthz` 200, `/` 200 `text/html`, `/login` and `/board` 200 (SPA fallback), `/app/` 200, `/app/manifest.json` `application/manifest+json`, `/download/rota.apk` `application/vnd.android.package-archive`.
- JavaScript is served as `text/javascript` (the routes file forces it; Windows registries sometimes say `text/plain`).
- Lighthouse on `/` (desktop) and `/app/` (mobile): Performance ≥ 80, Best Practices ≥ 90, PWA installable on `/app/`.
- Two-device run of §4 «Done when» on the public URL, plus one Android phone with the APK from `/download/rota.apk`.
- VM health: `ssh rota-vm "Get-Process caddy | Select WS; Get-PSDrive C | Select Free"`: Caddy under 100 MB, more than 5 GB free.

## 8. Guardrails

- Never ask for, print or store the Administrator password; SSH keys only. Never copy `.secrets/` or any secret key to the VM: it serves static files with the publishable key only.
- Never install Docker, WSL or a database on this VM (2 GB RAM; Windows uses about 1.3 GB).
- Only `C:\srv\naryad\`, `C:\srv\bin\` and `routes\naryad.caddy` are Rota's. Changes to the shared `Caddyfile` are additive.
- Do not run `git` from any sandbox that mounts the repo; commit from the Mac terminal.
- Vercel stays possible as a backup (`apps/web/vercel.json` exists) but is not the primary link.

## 9. Report

The four public URLs, `smoke` output, Lighthouse numbers, the EAS build link and APK size, FCM status, whether the PWA met §4 «Done when», and anything that needed the user.
