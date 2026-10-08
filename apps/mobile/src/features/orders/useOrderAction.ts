// Every order mutation from the phone goes through here (PHASE_2 §2.3): one client_action_id per tap,
// reused on every retry of that tap; the button shows its spinner; HUD on success or error; the server's
// ANOTHER_IN_PROGRESS and NOT_ON_SHIFT become a confirm sheet and a retry with the flag.
import { isRotaError, parseAnotherInProgress, type ActionPayload, type Order, type OrderAction } from '@rota/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { newActionId, useApi } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { t } from '@/lib/i18n';
import { qk } from '@/lib/keys';
import { useConfirm } from '@/ui/ConfirmSheet';
import { useHud, type HudApi } from '@/ui/Hud';

export interface RunOptions {
  /** HUD text on success, e.g. «В работе». The order number is shown as the mono prefix. */
  success?: string;
  number?: number;
  /** Medium haptic for accept and start, light otherwise. */
  strongHaptic?: boolean;
}

export function errorText(e: unknown): string {
  if (isRotaError(e)) return e.message;
  return t('error.UNKNOWN');
}

/**
 * The error of a mutation outside order_action (on shift, demo settings, reset) in the HUD. NETWORK reads
 * «Нет связи. Повторить?» and offers «Повторить», which runs `retry` (PHASE_2 §2.3 every mutation).
 * `fallback` replaces the generic text for an error that is not a RotaError.
 */
export function showErrorHud(hud: HudApi, e: unknown, retry?: () => void, fallback?: string): void {
  const network = isRotaError(e) && e.code === 'NETWORK';
  hud.show({
    message: !isRotaError(e) && fallback ? fallback : errorText(e),
    tone: 'critical',
    ...(network && retry ? { actionLabel: t('common.retry'), onAction: retry, duration: 6000 } : {}),
  });
}

/** True when the order is no longer visible to me: reassigned to someone else (RLS) or deleted by a demo reset. */
export function isOrderGone(e: unknown): boolean {
  return isRotaError(e) && e.code === 'BAD_INPUT' && e.details === 'order not found';
}

export function useOrderAction() {
  const api = useApi();
  const hud = useHud();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [pending, setPending] = useState<OrderAction | null>(null);

  const run = useCallback(
    async (orderId: number, action: OrderAction, payload: ActionPayload = {}, opts: RunOptions = {}): Promise<Order | null> => {
      const clientActionId = newActionId();
      let p: ActionPayload = payload;
      setPending(action);
      try {
        for (let attempt = 0; attempt < 4; attempt++) {
          try {
            const order = await api.orders.action(orderId, action, p, clientActionId);
            void (opts.strongHaptic ? haptic.medium() : haptic.light());
            await Promise.all([
              qc.invalidateQueries({ queryKey: qk.orders }),
              qc.invalidateQueries({ queryKey: qk.order(orderId) }),
              qc.invalidateQueries({ queryKey: qk.workers }),
            ]);
            if (opts.success) {
              hud.show({ message: opts.success, ...(opts.number ? { monoPrefix: `№${opts.number}` } : {}) });
            }
            return order;
          } catch (e) {
            if (isRotaError(e)) {
              if (e.code === 'ANOTHER_IN_PROGRESS' && !p.pause_current) {
                // Supabase hands the details over as JSON text, the mock as an object.
                const d = parseAnotherInProgress(e.details);
                const ok = await confirm({
                  title: t('error.ANOTHER_IN_PROGRESS', { number: d?.number ?? '' }),
                  confirmLabel: t('confirm.pauseAndStart'),
                });
                if (!ok) return null;
                p = { ...p, pause_current: true };
                continue;
              }
              if (e.code === 'NOT_ON_SHIFT' && !p.allow_off_shift) {
                const ok = await confirm({ title: e.message, confirmLabel: t('confirm.reassignAnyway') });
                if (!ok) return null;
                p = { ...p, allow_off_shift: true };
                continue;
              }
              if (e.code === 'NETWORK') {
                const ok = await confirm({ title: e.message, confirmLabel: t('common.retry') });
                if (ok) continue;
                return null;
              }
              // The order moved on elsewhere, or left me (reassign hides it): refetch so the screen catches up.
              if (e.code === 'BAD_TRANSITION' || e.code === 'FORBIDDEN') {
                await qc.invalidateQueries({ queryKey: qk.order(orderId) });
                await qc.invalidateQueries({ queryKey: qk.orders });
              }
            }
            void haptic.error();
            hud.show({ message: errorText(e), tone: 'critical' });
            return null;
          }
        }
        return null;
      } finally {
        setPending(null);
      }
    },
    [api, confirm, hud, qc],
  );

  return { run, pending };
}
