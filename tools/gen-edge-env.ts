// Builds the Edge Function secrets from the git ignored files in .secrets/ (CLAUDE.md §22):
//   .secrets/edge.env              for `npx supabase secrets set --env-file .secrets/edge.env --project-ref wcjklkpkuhxgfdtbwbuk`
//                                  or to copy key by key into Dashboard → Edge Functions → Secrets
//   supabase/functions/.env        for local `supabase functions serve` (git ignored)
// Generates TELEGRAM_WEBHOOK_SECRET once and stores it in .secrets/telegram.env. Never prints a value.
//   npx tsx tools/gen-edge-env.ts
import { randomBytes } from 'node:crypto';
import { appendFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { readSecrets } from './lib/env.ts';

const root = resolve(import.meta.dirname, '..');
const anthropic = readSecrets('anthropic');
let telegram = readSecrets('telegram');

if (!telegram.TELEGRAM_WEBHOOK_SECRET) {
  // Telegram allows 1 to 256 characters of A-Z, a-z, 0-9, _ and -.
  const secret = randomBytes(24).toString('hex');
  appendFileSync(resolve(root, '.secrets/telegram.env'), `TELEGRAM_WEBHOOK_SECRET=${secret}\n`);
  telegram = readSecrets('telegram');
  console.log('generated TELEGRAM_WEBHOOK_SECRET in .secrets/telegram.env');
}

const required = { ANTHROPIC_API_KEY: anthropic.ANTHROPIC_API_KEY, TELEGRAM_BOT_TOKEN: telegram.TELEGRAM_BOT_TOKEN };
for (const [k, v] of Object.entries(required)) {
  if (!v) {
    console.error(`missing ${k} in .secrets/`);
    process.exit(1);
  }
}

const edge: Record<string, string> = {
  ANTHROPIC_API_KEY: anthropic.ANTHROPIC_API_KEY ?? '',
  LLM_BUDGET_USD: anthropic.LLM_BUDGET_USD || '4',
  LLM_PROVIDER: 'anthropic',
  LLM_MODEL_SMART: 'claude-sonnet-5-5',
  LLM_MODEL_FAST: 'claude-haiku-5-5',
  TELEGRAM_BOT_TOKEN: telegram.TELEGRAM_BOT_TOKEN ?? '',
  TELEGRAM_WEBHOOK_SECRET: telegram.TELEGRAM_WEBHOOK_SECRET ?? '',
};

const body = Object.entries(edge)
  .map(([k, v]) => `${k}=${v}`)
  .join('\n');
writeFileSync(resolve(root, '.secrets/edge.env'), `# Edge Function secrets for project rota. Never commit.\n${body}\n`, { mode: 0o600 });
// Local serving uses the mock provider unless you change it by hand: no spend from a dev loop.
writeFileSync(
  resolve(root, 'supabase/functions/.env'),
  `# Local Edge Function env (git ignored). LLM_PROVIDER=mock by default.\n${body.replace('LLM_PROVIDER=anthropic', 'LLM_PROVIDER=mock')}\n`,
  { mode: 0o600 },
);
console.log(`wrote .secrets/edge.env and supabase/functions/.env with keys: ${Object.keys(edge).join(', ')}`);
