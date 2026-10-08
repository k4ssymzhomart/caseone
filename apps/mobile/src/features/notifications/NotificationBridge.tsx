// Notifications in the app (CLAUDE.md §8 in-app, PHASE_2 §2.3 toasts, §2.5 cold start):
// - a new own notification → HUD toast with its title, ding and haptic; kind emergency → the red screen
// - a tap on a system notification (or its «Принять» action) → accept through the API, then the order
// - a notification that launched the app is handled once the session is known
// - sign in or foreground with an emergency order of mine still «Выдан» → the red screen
import type { AppNotification, OrderView } from '@rota/shared';
import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { newActionId, useApi, useSession } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { t } from '@/lib/i18n';
import { configureNotifications, orderIdOf, urlOf } from '@/lib/notifications';
import { playDing } from '@/lib/siren';
import { useHud } from '@/ui/Hud';

const handledResponses = new Set<string>();

export function openUrl(url: string | null | undefined): void {
  if (!url) return;
  // Notification URLs are mobile routes: /order/{id}, /order/{id}/review, /emergency/{id}, /order/{id}?reassign=…
  router.push(url as Href);
}

export function NotificationBridge() {
  const api = useApi();
  const hud = useHud();
  const session = useSession();
  const uid = session?.user_id ?? null;
  const role = session?.role ?? null;
  const lastEmergency = useRef<number | null>(null);

  useEffect(() => {
    void configureNotifications();
  }, []);

  // In-app toasts and the emergency screen from realtime.
  useEffect(() => {
    if (!uid) return;
    return api.realtime.subscribe('notifications', (e) => {
      if (e.type !== 'INSERT' || !e.row) return;
      const n = e.row as AppNotification;
      if (n.recipient_id !== uid) return;
      if (n.kind === 'emergency' && n.order_id && role === 'worker') {
        lastEmergency.current = n.order_id;
        router.push(`/emergency/${n.order_id}` as Href);
        return;
      }
      playDing();
      void (n.severity === 'critical' ? haptic.warning() : haptic.light());
      hud.show({
        message: n.title,
        tone: n.severity === 'critical' ? 'critical' : 'default',
        duration: 4000,
        actionLabel: t('hud.open'),
        onAction: () => {
          void api.notifications.markRead(n.id).catch(() => undefined);
          openUrl(n.url);
        },
      });
    });
  }, [api, hud, uid, role]);

  // Taps on system notifications, including the cold start one.
  const lastResponse = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!uid || !lastResponse) return;
    const id = lastResponse.notification.request.identifier + lastResponse.actionIdentifier;
    if (handledResponses.has(id)) return;
    handledResponses.add(id);
    const orderId = orderIdOf(lastResponse.notification);
    const url = urlOf(lastResponse.notification);
    if (lastResponse.actionIdentifier === 'accept' && orderId) {
      api.orders
        .action(orderId, 'accept', {}, newActionId())
        .catch(() => undefined)
        .finally(() => openUrl(`/order/${orderId}`));
      return;
    }
    openUrl(url ?? (orderId ? `/order/${orderId}` : null));
  }, [api, lastResponse, uid]);

  // A pending emergency order opens the red screen on sign in and on every return to the foreground.
  useEffect(() => {
    if (!uid || role !== 'worker') return;
    const check = async () => {
      try {
        const list: OrderView[] = await api.orders.list({ assignee_id: uid, statuses: ['issued'] });
        const pending = list.find((o) => o.priority === 'emergency');
        if (pending && lastEmergency.current !== pending.id) {
          lastEmergency.current = pending.id;
          router.push(`/emergency/${pending.id}` as Href);
        }
      } catch {
        // offline: the next foreground tries again
      }
    };
    void check();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        lastEmergency.current = null;
        void check();
      }
    });
    return () => sub.remove();
  }, [api, role, uid]);

  return null;
}
