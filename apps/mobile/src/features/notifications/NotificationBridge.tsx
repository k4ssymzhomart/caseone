// Notifications in the app (CLAUDE.md §8 in-app, PHASE_2 §2.3 toasts, §2.5 cold start):
// - a new own notification → HUD toast with its title and body, ding and haptic; kind emergency → the red screen
// - a tap on a system notification (or its «Принять» action) → accept through the API, then the order
// - a notification that launched the app is handled once a role screen is up (after the index redirect or login)
// - sign in or foreground with an emergency order of mine still «Выдан» → the red screen
import { isRotaError, type AppNotification, type OrderView } from '@rota/shared';
import { useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { router, useSegments, type Href } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { errorText } from '@/features/orders/useOrderAction';
import { newActionId, useApi, useSession } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { t } from '@/lib/i18n';
import { qk } from '@/lib/keys';
import { liveHub } from '@/lib/liveHub';
import { configureNotifications, orderIdOf, urlOf } from '@/lib/notifications';
import { playDing } from '@/lib/siren';
import { useHud } from '@/ui/Hud';

import { emergencyIdOf, markAccepting, openEmergency } from './emergencyGate';

const handledResponses = new Set<string>();
/** After a successful accept the mark stays a little: a foreground check started before it may still say «Выдан». */
const ACCEPT_MARK_MS = 5000;

export function openUrl(url: string | null | undefined): void {
  if (!url) return;
  // Notification URLs are mobile routes: /order/{id}, /order/{id}/review, /emergency/{id}, /order/{id}?reassign=…
  const emergency = emergencyIdOf(url);
  if (emergency) {
    openEmergency(emergency);
    return;
  }
  router.push(url as Href);
}

export function NotificationBridge() {
  const api = useApi();
  const hud = useHud();
  const qc = useQueryClient();
  const session = useSession();
  const uid = session?.user_id ?? null;
  const role = session?.role ?? null;
  const lastEmergency = useRef<number | null>(null);
  // A role screen is mounted: the index redirect or the login replace has gone out, so a push now stays on top.
  // useSegments() is [] on the index route and ['(auth)', …] on login and onboarding.
  const segments = useSegments() as string[];
  const routed = segments.length > 0 && segments[0] !== '(auth)';

  useEffect(() => {
    void configureNotifications();
  }, []);

  // In-app toasts and the emergency screen from realtime (liveHub: createLiveSync or the mock's events).
  useEffect(() => {
    if (!uid) return;
    return liveHub.onNotification((n: AppNotification) => {
      if (n.recipient_id !== uid) return;
      // createLiveSync refetches the lists; the open order card (reassigned away, cancelled, overdue) and the
      // shift counters (the watchdog's overdue changes no orders row) are refreshed here.
      if (n.order_id != null) void qc.invalidateQueries({ queryKey: qk.order(n.order_id) });
      if (n.kind === 'overdue' || n.kind === 'manager_overdue') void qc.invalidateQueries({ queryKey: qk.shift });
      if (n.kind === 'emergency' && n.order_id && role === 'worker') {
        lastEmergency.current = n.order_id;
        openEmergency(n.order_id);
        return;
      }
      playDing();
      void (n.severity === 'critical' ? haptic.warning() : haptic.light());
      hud.show({
        message: n.title,
        ...(n.body ? { detail: n.body } : {}),
        tone: n.severity === 'critical' ? 'critical' : 'default',
        duration: 4000,
        actionLabel: t('hud.open'),
        onAction: () => {
          void api.notifications.markRead(n.id).catch(() => undefined);
          openUrl(n.url);
        },
      });
    });
  }, [api, hud, qc, uid, role]);

  /** «Принять» on a system notification: one client_action_id for the tap and every retry of it. */
  const acceptFromNotification = useCallback(
    (orderId: number, clientActionId: string) => {
      const unmark = markAccepting(orderId);
      api.orders
        .action(orderId, 'accept', {}, clientActionId)
        .then((order) => {
          void haptic.medium();
          void qc.invalidateQueries({ queryKey: qk.orders });
          void qc.invalidateQueries({ queryKey: qk.order(orderId) });
          hud.show({ message: t('order.hud.accepted'), monoPrefix: `№${order.number}` });
          setTimeout(unmark, ACCEPT_MARK_MS);
        })
        .catch((e: unknown) => {
          unmark();
          void haptic.error();
          const network = isRotaError(e) && e.code === 'NETWORK';
          hud.show({
            message: errorText(e),
            tone: 'critical',
            ...(network
              ? {
                  actionLabel: t('common.retry'),
                  onAction: () => acceptFromNotification(orderId, clientActionId),
                  duration: 8000,
                }
              : {}),
          });
        })
        .finally(() => openUrl(`/order/${orderId}`));
    },
    [api, hud, qc],
  );

  // Taps on system notifications, including the one that launched the app. Declared before the emergency check
  // so a «Принять» marks its order before that check runs in the same commit.
  const lastResponse = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!uid || !routed || !lastResponse) return;
    const id = lastResponse.notification.request.identifier + lastResponse.actionIdentifier;
    if (handledResponses.has(id)) return;
    handledResponses.add(id);
    // Handled once: a JS reload in the dev client must not replay it.
    try {
      Notifications.clearLastNotificationResponse();
    } catch {
      // older native module: the handled set still guards this session
    }
    const orderId = orderIdOf(lastResponse.notification);
    const url = urlOf(lastResponse.notification);
    if (lastResponse.actionIdentifier === 'accept' && orderId) {
      acceptFromNotification(orderId, newActionId());
      return;
    }
    openUrl(url ?? (orderId ? `/order/${orderId}` : null));
  }, [acceptFromNotification, lastResponse, routed, uid]);

  // A pending emergency order opens the red screen on sign in and on every return to the foreground.
  useEffect(() => {
    if (!uid || role !== 'worker' || !routed) return;
    const check = async () => {
      try {
        const list: OrderView[] = await api.orders.list({ assignee_id: uid, statuses: ['issued'] });
        const pending = list.find((o) => o.priority === 'emergency');
        if (pending && lastEmergency.current !== pending.id) {
          lastEmergency.current = pending.id;
          openEmergency(pending.id);
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
  }, [api, role, routed, uid]);

  return null;
}
