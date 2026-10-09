// The landing's JavaScript budget (docs/LANDING.md §4: at most 150 kB gzip). Builds the app with a manifest into a
// temporary folder and sums what a signed out visit to `/` requests: the entry chunk, the landing/mount chunk it
// imports dynamically, and their static imports, each gzipped at level 9 as Vite reports them. Exits 1 over budget.
//   npm run budget --workspace apps/web   (node apps/web/scripts/landing-budget.mjs)
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const BUDGET_KB = 150;
const web = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = mkdtempSync(join(tmpdir(), 'rota-landing-budget-'));

try {
  execFileSync('npx', ['vite', 'build', '--manifest', '--outDir', out, '--emptyOutDir', '--logLevel', 'error'], {
    cwd: web,
    stdio: 'inherit',
  });
  const manifest = JSON.parse(readFileSync(join(out, '.vite/manifest.json'), 'utf8'));
  const keys = Object.keys(manifest);
  const files = new Set();
  const walk = (key) => {
    const chunk = manifest[key];
    if (files.has(chunk.file)) return;
    files.add(chunk.file);
    for (const dep of chunk.imports ?? []) walk(dep);
  };
  walk(keys.find((k) => manifest[k].isEntry));
  walk(keys.find((k) => k.endsWith('landing/mount.tsx')));

  const rows = [...files].map((file) => {
    const bytes = readFileSync(join(out, file));
    return { file, raw: bytes.length / 1000, gzip: gzipSync(bytes, { level: 9 }).length / 1000 };
  });
  rows.sort((a, b) => b.gzip - a.gzip);
  for (const r of rows) console.log(`${r.gzip.toFixed(2).padStart(8)} kB gzip ${r.raw.toFixed(2).padStart(9)} kB  ${r.file}`);
  const total = rows.reduce((sum, r) => sum + r.gzip, 0);
  console.log(`Landing JS: ${total.toFixed(2)} kB gzip of ${BUDGET_KB} kB (${rows.length} files)`);
  if (total > BUDGET_KB) process.exitCode = 1;
} finally {
  rmSync(out, { recursive: true, force: true });
}
