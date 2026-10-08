// Screenshots of the web panel for the presentation and docs, through headless Chrome and the DevTools protocol.
// Signs in with the real test accounts (publishable key only), injects the supabase-js session into
// localStorage, then captures each page at 1440 × 900 (2× pixels).
//   npm run dev:web            (in another terminal, port 5173)
//   npx tsx tools/web-screens.ts [--out docs/screenshots/presentation/web] [--base http://localhost:5173]
// No dependencies: Node's global fetch and WebSocket, and the Chrome already installed on the Mac.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { readSecrets } from './lib/env.ts';

const args = process.argv.slice(2);
const arg = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1]! : fallback;
};
const base = arg('--base', 'http://localhost:5173');
const out = resolve(import.meta.dirname, '..', arg('--out', 'docs/screenshots/presentation/web'));
mkdirSync(out, { recursive: true });

const sb = readSecrets('supabase');
const url = sb.SUPABASE_URL!;
const key = sb.SUPABASE_PUBLISHABLE_KEY!;
const storageKey = `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;

async function session(tab: string, pin: string): Promise<unknown> {
  const r = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: key, 'content-type': 'application/json' },
    body: JSON.stringify({ email: `${tab}@naryad.local`, password: `nr_${pin}_kz` }),
  });
  const j = (await r.json()) as Record<string, unknown>;
  if (!j.access_token) throw new Error(`sign in ${tab} failed: ${String(j.error_code ?? r.status)}`);
  return { ...j, expires_at: Math.floor(Date.now() / 1000) + Number(j.expires_in ?? 3600) };
}

const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 9333;
const proc = spawn(
  chrome,
  [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${join(tmpdir(), `rota-web-screens-${Date.now()}`)}`,
    '--hide-scrollbars',
    '--force-dark-mode',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function target(): Promise<string> {
  for (let i = 0; i < 50; i++) {
    try {
      const list = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()) as { type: string; webSocketDebuggerUrl: string }[];
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      // Chrome not up yet
    }
    await sleep(200);
  }
  throw new Error('Chrome did not start');
}

const ws = new WebSocket(await target());
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let seq = 0;
const pending = new Map<number, (v: Record<string, unknown>) => void>();
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(String(ev.data)) as { id?: number; result?: Record<string, unknown> };
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)!(msg.result ?? {});
    pending.delete(msg.id);
  }
});
const send = (method: string, params: Record<string, unknown> = {}) =>
  new Promise<Record<string, unknown>>((res) => {
    const id = ++seq;
    pending.set(id, res);
    ws.send(JSON.stringify({ id, method, params }));
  });

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false });

async function go(path: string, settleMs = 3500) {
  await send('Page.navigate', { url: `${base}${path}` });
  await sleep(settleMs);
}
async function evaluate(expression: string) {
  return send('Runtime.evaluate', { expression, awaitPromise: true });
}
async function shot(name: string, fullPage = false) {
  let clip: Record<string, unknown> | undefined;
  if (fullPage) {
    const m = (await send('Page.getLayoutMetrics')) as { cssContentSize?: { width: number; height: number } };
    const h = Math.min(m.cssContentSize?.height ?? 900, 2400);
    clip = { x: 0, y: 0, width: 1440, height: h, scale: 1 };
  }
  const res = (await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: fullPage, ...(clip ? { clip } : {}) })) as {
    data: string;
  };
  writeFileSync(join(out, `${name}.png`), Buffer.from(res.data, 'base64'));
  console.log('wrote', `${name}.png`);
}
async function signInAs(tab: string, pin: string) {
  await go('/login', 1500);
  const s = await session(tab, pin);
  await evaluate(`localStorage.setItem(${JSON.stringify(storageKey)}, ${JSON.stringify(JSON.stringify(s))}); localStorage.setItem('rota.theme', 'dark'); true`);
}

try {
  // Signed out: the login page.
  await go('/login', 2500);
  await shot('w01-login');

  // Master Жумабаев.
  await signInAs('1001', '1111');
  await go('/shift');
  await shot('w02-shift');
  await go('/board');
  await shot('w03-board');
  await go('/reports/shift', 5000);
  await shot('w04-shift-report', true);
  await go('/reports/rating', 5000);
  await shot('w05-rating', true);
  await go('/analytics', 6000);
  await shot('w06-analytics', true);
  await go('/equipment/13', 4000);
  await shot('w07-equipment-k3', true);
  // A closed order with an AI review: the newest closed order the master can see.
  const closed = (await evaluate(`(async () => {
    const t = JSON.parse(localStorage.getItem(${JSON.stringify(storageKey)}));
    const r = await fetch(${JSON.stringify(url)} + '/rest/v1/v_orders?select=id&status=eq.closed&ai_review_id=not.is.null&order=closed_at.desc&limit=1',
      { headers: { apikey: ${JSON.stringify(key)}, authorization: 'Bearer ' + t.access_token } });
    const j = await r.json(); return j[0] ? j[0].id : null;
  })()`)) as { result?: { value?: number | null } };
  const orderId = closed.result?.value;
  if (orderId) {
    await go(`/orders/${orderId}`, 4500);
    await shot('w08-order-report', true);
  }
  await go('/demo');
  await shot('w09-demo');
  await go('/kit', 3000);
  await shot('w10-kit', true);

  // Руководитель Тлеубаев: the dashboard.
  await signInAs('3001', '3333');
  await go('/dashboard', 5000);
  await shot('w11-dashboard', true);

  // Admin Садыкова: directories, settings and «Что видит ИИ».
  await signInAs('9001', '9999');
  await go('/admin/directories', 4000);
  await shot('w12-admin-directories');
  await go('/admin/settings', 3500);
  await shot('w13-admin-settings');
  await go('/admin/ai', 4000);
  await shot('w14-admin-what-ai-sees', true);
} finally {
  ws.close();
  proc.kill();
}
console.log(`done: ${out}`);
