// Notifications foundation (CLAUDE.md §8, PHASE_0 0.6): handler, Android channels, the order_actions
// category, permission, Expo push token, local test notifications and URL extraction.
// Channel settings freeze once created on a device: to change a sound or importance, use a new id
// (for example `emergency_v2`) instead of editing these.
import { primitives } from '@rota/design';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';

import { t } from './i18n';
import { useLiveStatus } from './liveHub';

export const CHANNEL = { orders: 'orders', emergency: 'emergency', reminders: 'reminders' } as const;
export type ChannelId = (typeof CHANNEL)[keyof typeof CHANNEL];
export const CATEGORY_ORDER_ACTIONS = 'order_actions';
export const SOUND = { siren: 'siren.wav', ding: 'ding.wav' } as const;

let configured = false;

/** Called once at startup, before any notification can arrive. */
export async function configureNotifications(): Promise<void> {
  if (configured) return;
  configured = true;

  // In the foreground the same event arrives through realtime as the HUD toast or the red screen with its own
  // siren (CLAUDE.md §8 in-app), so a remote push then stays silent in the list. Local notifications (the test
  // buttons) keep their banner, and so does a push while the live channel is down: it is the only signal then.
  Notifications.setNotificationHandler({
    handleNotification: async (n) => {
      const trigger = n.request.trigger as { type?: string } | null;
      const quiet =
        trigger?.type === 'push' &&
        AppState.currentState === 'active' &&
        useLiveStatus.getState().status === 'live';
      return {
        shouldShowBanner: !quiet,
        shouldShowList: true,
        shouldPlaySound: !quiet,
        shouldSetBadge: false,
      };
    },
  });

  if (Platform.OS === 'android') {
    await Promise.all([
      Notifications.setNotificationChannelAsync(CHANNEL.orders, {
        name: t('notif.channel.orders'),
        importance: Notifications.AndroidImportance.HIGH,
        sound: SOUND.ding,
        vibrationPattern: [0, 250, 150, 250],
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      }),
      Notifications.setNotificationChannelAsync(CHANNEL.emergency, {
        name: t('notif.channel.emergency'),
        importance: Notifications.AndroidImportance.MAX,
        sound: SOUND.siren,
        vibrationPattern: [0, 600, 200, 600, 200, 600],
        enableLights: true,
        lightColor: primitives['red/500'],
        bypassDnd: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      }),
      Notifications.setNotificationChannelAsync(CHANNEL.reminders, {
        name: t('notif.channel.reminders'),
        importance: Notifications.AndroidImportance.DEFAULT,
        sound: 'default',
      }),
    ]).catch(() => undefined);
  }

  await Notifications.setNotificationCategoryAsync(CATEGORY_ORDER_ACTIONS, [
    { identifier: 'accept', buttonTitle: t('notif.action.accept'), options: { opensAppToForeground: true } },
    { identifier: 'open', buttonTitle: t('notif.action.open'), options: { opensAppToForeground: true } },
  ]).catch(() => undefined);
}

export type PermissionState = 'granted' | 'denied' | 'undetermined';

export async function permissionState(): Promise<PermissionState> {
  const p = await Notifications.getPermissionsAsync();
  if (p.granted) return 'granted';
  return p.canAskAgain ? 'undetermined' : 'denied';
}

/** Only the onboarding screen calls this. */
export async function requestPermission(): Promise<PermissionState> {
  const p = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowSound: true, allowBadge: false, allowCriticalAlerts: false },
  });
  if (p.granted) return 'granted';
  return p.canAskAgain ? 'undetermined' : 'denied';
}

export function easProjectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? undefined;
}

/**
 * The Expo push token, or null. Quiet on failure: no projectId yet, no google-services.json on
 * Android, or the iOS Simulator without APNs. The profile then shows «Push пока не настроен».
 */
export async function getPushToken(): Promise<string | null> {
  try {
    const projectId = easProjectId();
    if (!projectId || !Device.isDevice) return null;
    if ((await permissionState()) !== 'granted') return null;
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return token.data;
  } catch {
    return null;
  }
}

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
  const url = urlOf(notification);
  const m = url ? /\/(?:order|emergency)\/(\d+)/.exec(url) : null;
  return m ? Number(m[1]) : null;
}

/** Local test notifications for /demo and /kit: Android channel plus iOS sound, a URL to open. */
export async function sendTestNotification(kind: 'order' | 'emergency', url: string): Promise<void> {
  const emergency = kind === 'emergency';
  await Notifications.scheduleNotificationAsync({
    content: {
      title: t(emergency ? 'notif.test.emergencyTitle' : 'notif.test.orderTitle'),
      body: t(emergency ? 'notif.test.emergencyBody' : 'notif.test.orderBody'),
      data: { url, kind: emergency ? 'emergency' : 'new_order' },
      sound: emergency ? SOUND.siren : SOUND.ding,
      categoryIdentifier: CATEGORY_ORDER_ACTIONS,
      priority: emergency ? Notifications.AndroidNotificationPriority.MAX : Notifications.AndroidNotificationPriority.HIGH,
      ...(emergency && Platform.OS === 'android' ? { color: primitives['red/500'] } : {}),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 2,
      channelId: emergency ? CHANNEL.emergency : CHANNEL.orders,
    },
  });
}
