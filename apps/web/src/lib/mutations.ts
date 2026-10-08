// Write hooks. Every order mutation carries a client_action_id (CLAUDE.md §4): make one per click with
// newActionId() and pass the same id again when the user retries that click (NETWORK, ANOTHER_IN_PROGRESS,
// NOT_ON_SHIFT confirmations). Errors are RotaError: show error.message (Russian), branch on error.code.
//
//   const action = useOrderAction();
//   const caid = useRef(newActionId());
//   action.mutate({ id, action: 'close', payload: {}, clientActionId: caid.current }, { onSuccess: () => hud.show(...) });
import {
  isRotaError,
  qk,
  type ActionPayload,
  type CreateOrderInput,
  type OrderAction,
  type RotaError,
  type Settings,
} from '@rota/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { newActionId, useApi } from './api';

export interface OrderActionVars {
  id: number;
  action: OrderAction;
  payload?: ActionPayload;
  /** Reuse it for a retry of the same click; a new one is made when omitted. */
  clientActionId?: string;
}

/** rpc order_action. Refetches the order and the lists right away (live sync would do it within a second too). */
export function useOrderAction() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: OrderActionVars) =>
      api.orders.action(v.id, v.action, v.payload ?? {}, v.clientActionId ?? newActionId()),
    onSettled: (_data, error, v) => {
      // BAD_TRANSITION means the status already changed elsewhere: refetch before showing the message.
      void qc.invalidateQueries({ queryKey: qk.order(v.id) });
      void qc.invalidateQueries({ queryKey: qk.orders() });
      void qc.invalidateQueries({ queryKey: qk.workers() });
      void qc.invalidateQueries({ queryKey: qk.shift() });
      if (error && isRotaError(error) && error.code === 'BAD_TRANSITION') void qc.invalidateQueries({ queryKey: qk.order() });
    },
  });
}

export interface CreateOrderVars {
  input: CreateOrderInput;
  clientActionId?: string;
}

/** rpc create_order. NOT_ON_SHIFT → ask «Исполнитель не на смене. Всё равно выдать?», retry with allow_off_shift. */
export function useCreateOrder() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: CreateOrderVars) => api.orders.create(v.input, v.clientActionId ?? newActionId()),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.orders() });
      void qc.invalidateQueries({ queryKey: qk.workers() });
      void qc.invalidateQueries({ queryKey: qk.shift() });
    },
  });
}

/** rpc set_on_shift (the master may toggle a worker). */
export function useSetOnShift() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { employeeId: string; onShift: boolean }) => api.workers.setOnShift(v.employeeId, v.onShift),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.workers() });
      void qc.invalidateQueries({ queryKey: qk.brigades() });
      void qc.invalidateQueries({ queryKey: qk.directories() });
    },
  });
}

/** rpc set_setting per key (masters: demo_mode and demo_time_scale; admins every key). */
export function useUpdateSettings() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Settings>) => api.demo.updateSettings(patch),
    onSuccess: (settings) => {
      qc.setQueryData(qk.settings(), settings);
      void qc.invalidateQueries({ queryKey: qk.directories() });
    },
  });
}

/** rpc demo_reset, then every query refetches (the live sync resync does the same on the other devices). */
export function useDemoReset() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.demo.reset(),
    onSuccess: () => {
      api.realtime.resync();
      void qc.invalidateQueries();
    },
  });
}

export function useMarkRead() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.notifications.markRead(id),
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.notifications() }),
  });
}

/** The RotaError of a failed mutation or query, or null. */
export function rotaErrorOf(error: unknown): RotaError | null {
  return isRotaError(error) ? error : null;
}
