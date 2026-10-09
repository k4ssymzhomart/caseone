// Web build of the notifications (DEPLOY_VM.md §4). A browser gets no Expo push token: new orders, emergencies
// and AI reports arrive through the realtime notification hub (liveHub) as in-app toasts and the red emergency
// screen, which NotificationBridge already shows. Nothing to configure, no permission to ask: in-app
// notifications always show while the app is open. The local test notification becomes the same in-app toast,
// 2 s later like the native one.
import type { AppNotification } from '@rota/shared';
import Constants from 'expo-constants';
import type * as Notifications from 'expo-notifications';

import { useSessionStore } from './api';
import { t } from './i18n';
import { liveHub } from './liveHub';
import { orderIdOfUrl } from './notificationLinks';

export { orderIdOf, urlOf } from './notificationLinks';

export const CHANNEL = { orders: 'orders', emergency: 'emergency', reminders: 'reminders' } as const;
export type ChannelId = (typeof CHANNEL)[keyof typeof CHANNEL];
export const CATEGORY_ORDER_ACTIONS = 'order_actions';
export const SOUND = { siren: 'siren.wav', ding: 'ding.wav' } as const;

const TEST_DELAY_MS = 2000;

export async function configureNotifications(): Promise<void> {
  // no channels, categories or handler in a browser
}

export type PermissionState = 'granted' | 'denied' | 'undetermined';

/** In-app notifications need no browser permission, so onboarding is skipped and the test buttons work. */
export async function permissionState(): Promise<PermissionState> {
  return 'granted';
}

export async function requestPermission(): Promise<PermissionState> {
  return 'granted';
}

export function easProjectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? undefined;
}

/** No Expo push token in a browser: the profile shows «Push пока не настроен». */
export async function getPushToken(): Promise<string | null> {
  return null;
}

/** No system notifications to tap in a browser. */
export function useLastNotificationResponse(): Notifications.NotificationResponse | null | undefined {
  return null;
}

export function clearLastNotificationResponse(): void {
  // nothing was stored
}

/** The /demo and profile test: an in-app toast (or, for a worker, the red screen of a real order) after 2 s. */
export async function sendTestNotification(kind: 'order' | 'emergency', url: string): Promise<void> {
  const uid = useSessionStore.getState().session?.user_id;
  if (!uid) return;
  const emergency = kind === 'emergency';
  const now = new Date();
  const n: AppNotification = {
    id: -now.getTime(),
    recipient_id: uid,
    order_id: orderIdOfUrl(url),
    kind: emergency ? 'emergency' : 'new_order',
    severity: emergency ? 'critical' : 'info',
    title: t(emergency ? 'notif.test.emergencyTitle' : 'notif.test.orderTitle'),
    body: t(emergency ? 'notif.test.emergencyBody' : 'notif.test.orderBody'),
    url,
    dedupe_key: `test:${now.getTime()}`,
    created_at: now.toISOString(),
    read_at: null,
    push_sent_at: null,
    tg_sent_at: null,
  };
  setTimeout(() => liveHub.emitNotification(n), TEST_DELAY_MS);
}
