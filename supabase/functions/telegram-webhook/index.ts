// Rota · telegram-webhook (CLAUDE.md §8): links a Telegram chat to an employee.
// The profile calls rpc('telegram_link_token') and opens t.me/<bot>?start=<token>; Telegram then posts the
// /start message here. Deployed with verify_jwt = false; Telegram proves itself with the secret token header
// set by setWebhook(secret_token = TELEGRAM_WEBHOOK_SECRET). Send only: no commands besides /start.

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
const WEBHOOK_SECRET = Deno.env.get('TELEGRAM_WEBHOOK_SECRET') ?? '';

function readSecretKey(): string {
  const keys = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (keys) {
    try {
      const parsed = JSON.parse(keys) as Record<string, string>;
      if (parsed.default) return parsed.default;
    } catch {
      // fall through
    }
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
}

const admin = createClient(SUPABASE_URL, readSecretKey(), {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function reply(chatId: number, text: string): Promise<void> {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok');
  if (!WEBHOOK_SECRET || req.headers.get('X-Telegram-Bot-Api-Secret-Token') !== WEBHOOK_SECRET) {
    return new Response('unauthorized', { status: 401 });
  }
  const update = await req.json().catch(() => null) as
    | { message?: { chat?: { id: number }; text?: string } }
    | null;
  const chatId = update?.message?.chat?.id;
  const text = update?.message?.text ?? '';
  if (!chatId) return new Response('ok');

  const m = text.match(/^\/start\s+([0-9a-f]{24})$/);
  if (!m) {
    await reply(chatId, 'Чтобы получать наряды, откройте Rota → Профиль → «Подключить Telegram».');
    return new Response('ok');
  }

  const { data: link } = await admin
    .from('tg_link_tokens')
    .select('employee_id, expires_at')
    .eq('token', m[1])
    .maybeSingle();
  if (!link || new Date(link.expires_at).getTime() < Date.now()) {
    await reply(chatId, 'Ссылка устарела. Откройте «Подключить Telegram» в профиле ещё раз.');
    return new Response('ok');
  }

  await admin.from('employees').update({ telegram_chat_id: chatId }).eq('id', link.employee_id);
  await admin.from('tg_link_tokens').delete().eq('token', m[1]);
  await reply(chatId, 'Готово. Наряды и напоминания будут приходить сюда, без имён сотрудников.');
  return new Response('ok');
});
