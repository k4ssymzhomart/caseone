// Rota · notify-dispatch (CLAUDE.md §8)
// Called by the database (trigger notifications_dispatch → pg_net) for every new notification row.
// Sends an Expo push to every device of the recipient, then the same event to Telegram WITHOUT personal names.
// Deployed with verify_jwt = false: the caller must send the project secret key in the `apikey` header.

import { createClient } from 'npm:@supabase/supabase-js@2';

type Notification = {
  id: number;
  recipient_id: string;
  order_id: number | null;
  kind: string;
  severity: string;
  title: string;
  body: string;
  url: string | null;
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SECRET = readSecretKey();
const EXPO_ACCESS_TOKEN = Deno.env.get('EXPO_ACCESS_TOKEN') ?? '';
const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';

const admin = createClient(SUPABASE_URL, SECRET, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function readSecretKey(): string {
  const keys = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (keys) {
    try {
      const parsed = JSON.parse(keys) as Record<string, string>;
      if (parsed.default) return parsed.default;
    } catch {
      // fall through to the legacy key
    }
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
}

// CLAUDE.md §8: only these go to the quieter `reminders` channel; escalations and AI returns pop up like orders
const REMINDER_KINDS = new Set(['reminder', 'overdue', 'rework']);
const ACTION_KINDS = new Set(['new_order', 'emergency']);

function channelFor(kind: string): string {
  if (kind === 'emergency') return 'emergency';
  if (REMINDER_KINDS.has(kind)) return 'reminders';
  return 'orders';
}

function soundFor(kind: string): string {
  if (kind === 'emergency') return 'siren.wav';
  if (REMINDER_KINDS.has(kind)) return 'default';
  return 'ding.wav';
}

const STATUS_RU: Record<string, string> = {
  issued: 'Выдан', accepted: 'Принят в работу', queued: 'В очереди', rejected: 'Отклонён',
  in_progress: 'В работе', paused: 'Приостановлен', done: 'Исполнено', ai_review: 'Проверка ИИ',
  rework: 'На доработку', closed: 'Закрыт', cancelled: 'Отменён',
};

const TELEGRAM_PREFIX: Record<string, string> = {
  new_order: 'Новый наряд', emergency: 'АВАРИЙНЫЙ наряд', reminder: 'Скоро срок наряда',
  overdue: 'Просрочен наряд', escalation: 'Не принят наряд', manager_overdue: 'Длительная просрочка, наряд',
  rework: 'На доработку наряд', review_ready: 'Проверка ИИ, наряд', review_rework: 'ИИ вернул наряд',
  report: 'Отчёт ИИ по наряду', rejected: 'Отклонён наряд', reassigned: 'Передан другому исполнителю наряд',
  closed: 'Закрыт наряд', cancelled: 'Отменён наряд',
};

// Asia/Qostanay is UTC+5 all year
function hhmm(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 5 * 3600 * 1000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function sendPush(n: Notification): Promise<{ sent: number; removed: number }> {
  const { data: tokens, error } = await admin
    .from('push_tokens')
    .select('expo_token')
    .eq('employee_id', n.recipient_id);
  if (error) throw error;
  if (!tokens || tokens.length === 0) return { sent: 0, removed: 0 };

  const channelId = channelFor(n.kind);
  const messages = tokens.map((t) => ({
    to: t.expo_token,
    title: n.title,
    body: n.body,
    data: { url: n.url, order_id: n.order_id, kind: n.kind, notification_id: n.id },
    channelId,
    sound: soundFor(n.kind),
    priority: 'high',
    ...(ACTION_KINDS.has(n.kind) ? { categoryId: 'order_actions' } : {}),
  }));

  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${EXPO_ACCESS_TOKEN}` } : {}),
    },
    body: JSON.stringify(messages),
  });
  const out = (await res.json()) as {
    data?: Array<{ status: string; details?: { error?: string } }>;
    errors?: unknown;
  };

  let removed = 0;
  const tickets = out.data ?? [];
  for (let i = 0; i < tickets.length; i++) {
    const t = tickets[i];
    if (t?.status === 'error' && t.details?.error === 'DeviceNotRegistered') {
      await admin.from('push_tokens').delete().eq('expo_token', messages[i]!.to);
      removed++;
    }
  }
  if (res.ok) {
    await admin.from('notifications').update({ push_sent_at: new Date().toISOString() }).eq('id', n.id);
  } else {
    console.error('expo push failed', res.status, JSON.stringify(out.errors ?? out));
  }
  return { sent: messages.length - removed, removed };
}

// Telegram is an external service: order number, equipment, area, status and deadline only, never names
async function sendTelegram(n: Notification): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN) return false;
  const { data: emp } = await admin
    .from('employees')
    .select('telegram_chat_id')
    .eq('id', n.recipient_id)
    .maybeSingle();
  const chatId = emp?.telegram_chat_id;
  if (!chatId) return false;

  let text: string;
  if (n.kind === 'weekly_digest' || !n.order_id) {
    text = 'Сводка ИИ за неделю готова. Откройте Rota.';
  } else {
    const { data: o } = await admin
      .from('orders')
      .select('number, status, due_at, equipment(name), areas(name)')
      .eq('id', n.order_id)
      .maybeSingle();
    if (!o) return false;
    const eq = (o.equipment as unknown as { name: string } | null)?.name ?? '';
    const area = (o.areas as unknown as { name: string } | null)?.name ?? '';
    const prefix = TELEGRAM_PREFIX[n.kind] ?? 'Наряд';
    text = `${prefix} №${o.number}. ${eq}, ${area}. Статус: ${STATUS_RU[o.status] ?? o.status}. Срок до ${hhmm(o.due_at)}.`;
  }

  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_notification: n.severity === 'info' }),
  });
  if (res.ok) {
    await admin.from('notifications').update({ tg_sent_at: new Date().toISOString() }).eq('id', n.id);
  } else {
    console.error('telegram failed', res.status, await res.text());
  }
  return res.ok;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  if (!SECRET || req.headers.get('apikey') !== SECRET) return json({ error: 'unauthorized' }, 401);

  let payload: { record?: Notification; notification_id?: number };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'bad json' }, 400);
  }

  let n = payload.record;
  if (!n && payload.notification_id) {
    const { data } = await admin.from('notifications').select('*').eq('id', payload.notification_id).maybeSingle();
    n = data ?? undefined;
  }
  if (!n) return json({ error: 'no notification' }, 400);

  // each channel on its own: an Expo outage must not stop the Telegram backup, and the other way round
  let push: { sent: number; removed: number } | { error: string };
  let telegram: boolean | { error: string };
  try {
    push = await sendPush(n);
  } catch (e) {
    console.error('push failed', e);
    push = { error: String(e) };
  }
  try {
    telegram = await sendTelegram(n);
  } catch (e) {
    console.error('telegram failed', e);
    telegram = { error: String(e) };
  }
  const ok = !('error' in push);
  return json({ ok, push, telegram }, ok ? 200 : 502);
});
