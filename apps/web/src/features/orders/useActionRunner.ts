// One order action with the panel's feedback: the HUD on success («№147 · Закрыт»), the RotaError's Russian message
// on failure (in the HUD, or handed to the caller to show inside a dialog). The caller makes the client_action_id
// once per click (dialogs once per opening) and passes the same id again on a retry of that click.
import { STATUS_LABEL, type Order, type RotaError } from '@rota/shared';
import { useHud } from '@/components/HudHost';
import { rotaErrorOf, useOrderAction, type OrderActionVars } from '@/lib/mutations';
import { t } from './strings';

export interface RunOptions {
  /** HUD text on success; default the label of the new status. */
  success?: string | ((order: Order) => string);
  onSuccess?: (order: Order) => void;
  /** Given: the caller shows the error (dialogs keep it inline). Absent: the HUD shows it. */
  onError?: (error: RotaError | null) => void;
}

export function useActionRunner() {
  const mutation = useOrderAction();
  const hud = useHud();

  const run = (vars: OrderActionVars & { number: number }, options: RunOptions = {}) => {
    const { number, ...v } = vars;
    mutation.mutate(v, {
      onSuccess: (order) => {
        const text =
          typeof options.success === 'function' ? options.success(order) : (options.success ?? STATUS_LABEL[order.status]);
        hud.show({ monoPrefix: `№${number}`, message: text });
        options.onSuccess?.(order);
      },
      onError: (e) => {
        const err = rotaErrorOf(e);
        if (options.onError) options.onError(err);
        else hud.show({ monoPrefix: `№${number}`, message: err?.message ?? t('error.UNKNOWN'), tone: 'critical' });
      },
    });
  };

  return {
    run,
    pending: mutation.isPending,
    /** The action in flight, to show which button is busy. */
    running: mutation.isPending ? mutation.variables?.action : undefined,
  };
}

/** The Russian message of a failed call (NETWORK and unknown errors included). */
export function errorText(error: RotaError | null): string {
  return error?.message ?? t('error.UNKNOWN');
}
