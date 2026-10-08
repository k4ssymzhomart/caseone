// One time Telegram setup (CLAUDE.md §8): points the bot's webhook at the telegram-webhook Edge Function with
// secret_token = TELEGRAM_WEBHOOK_SECRET, so Telegram proves itself in X-Telegram-Bot-Api-Secret-Token.
// Run after the Edge secrets TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET are set on the project.
//   npx tsx tools/telegram-setup.ts            set the webhook, then print its state
//   npx tsx tools/telegram-setup.ts --info     print the state only
// Never prints the token or the secret.
import { readSecrets } from './lib/env.ts';

const tg = readSecrets('telegram');
const sb = readSecrets('supabase');
const token = tg.TELEGRAM_BOT_TOKEN;
const secret = tg.TELEGRAM_WEBHOOK_SECRET;
if (!token || !secret || !sb.SUPABASE_URL) {
  console.error('Need TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET (npx tsx tools/gen-edge-env.ts) and SUPABASE_URL.');
  process.exit(1);
}

const api = (method: string, body?: unknown) =>
  fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }).then((r) => r.json() as Promise<{ ok: boolean; description?: string; result?: Record<string, unknown> }>);

if (!process.argv.includes('--info')) {
  const url = `${sb.SUPABASE_URL}/functions/v1/telegram-webhook`;
  const res = await api('setWebhook', {
    url,
    secret_token: secret,
    allowed_updates: ['message'],
    drop_pending_updates: true,
  });
  console.log('setWebhook:', res.ok ? 'ok' : `failed: ${res.description}`);
}

const me = await api('getMe');
const info = await api('getWebhookInfo');
console.log('bot:', `@${String(me.result?.username ?? '?')}`);
console.log('webhook:', String(info.result?.url ?? '(none)'));
console.log('pending updates:', info.result?.pending_update_count ?? 0);
console.log('last error:', info.result?.last_error_message ?? 'none');
