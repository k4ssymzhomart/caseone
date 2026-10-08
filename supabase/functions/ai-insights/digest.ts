// The weekly digest notification (CLAUDE.md §8, §15): «Сводка ИИ за неделю: {n} выводов. Главное: {top_title}.»
// to every master and manager. The same text as renderWeeklyDigest() in packages/shared/src/domain/templates.ts.

export const WEEKLY_DIGEST_TITLE = 'Сводка ИИ за неделю';
export const WEEKLY_DIGEST_URL = '/analytics';

function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
}

export function weeklyDigestBody(count: number, topTitle?: string | null): string {
  const n = Math.max(0, Math.round(count));
  const top = (topTitle ?? '').trim().replace(/\.+$/, '').trim();
  return (
    `${WEEKLY_DIGEST_TITLE}: ${n} ${plural(n, 'вывод', 'вывода', 'выводов')}.` +
    (top ? ` Главное: ${top}.` : '')
  );
}

/** One key per week: the cron may run twice, the same people get one digest (unique recipient_id, dedupe_key). */
export function digestKey(weekStartDay: string): string {
  return `digest:${weekStartDay}`;
}

export interface DigestNotification {
  recipient_id: string;
  order_id: null;
  kind: 'weekly_digest';
  severity: 'info';
  title: string;
  body: string;
  url: string;
  dedupe_key: string;
}

export function digestNotifications(
  recipients: readonly string[],
  cards: readonly { title: string }[],
  weekStartDay: string,
): DigestNotification[] {
  if (cards.length === 0) return [];
  const body = weeklyDigestBody(cards.length, cards[0]?.title);
  return [...new Set(recipients)].map((id) => ({
    recipient_id: id,
    order_id: null,
    kind: 'weekly_digest',
    severity: 'info',
    title: WEEKLY_DIGEST_TITLE,
    body,
    url: WEEKLY_DIGEST_URL,
    dedupe_key: digestKey(weekStartDay),
  }));
}
