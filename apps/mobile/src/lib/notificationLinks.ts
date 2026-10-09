// Where a notification points: pure helpers shared by the native and the web notifications modules.
import type * as Notifications from 'expo-notifications';

/** URL of a notification: `data.url`, falling back to `data.body.url` (Expo puts push data under `body` on iOS). */
export function urlOf(notification: Notifications.Notification): string | null {
  const data = notification.request.content.data as Record<string, unknown> | undefined;
  const direct = data?.url;
  if (typeof direct === 'string') return direct;
  const body = data?.body as Record<string, unknown> | undefined;
  return typeof body?.url === 'string' ? body.url : null;
}

/** Order id from `/order/{id}`, `/order/{id}/review`, `/emergency/{id}` or `data.order_id`. */
export function orderIdOf(notification: Notifications.Notification): number | null {
  const data = notification.request.content.data as Record<string, unknown> | undefined;
  const raw = data?.order_id ?? (data?.body as Record<string, unknown> | undefined)?.order_id;
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string' && /^\d+$/.test(raw)) return Number(raw);
  return orderIdOfUrl(urlOf(notification));
}

/** Order id of a notification route, or null. */
export function orderIdOfUrl(url: string | null | undefined): number | null {
  const m = url ? /\/(?:order|emergency)\/(\d+)/.exec(url) : null;
  return m ? Number(m[1]) : null;
}
