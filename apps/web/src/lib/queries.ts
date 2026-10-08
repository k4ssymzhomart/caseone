// Read hooks: one per RotaApi read, on the shared React Query keys (@rota/shared qk), so live sync (lib/live.ts)
// refetches exactly what a realtime event changed. Pages call these, never api.* inside useEffect.
//
//   const board = useBoard(filters);            // board.data: OrderView[]
//   const { period, filters } = useReportFilter();
//   const report = useShiftReport({ ...period, filters });
//
// Every hook returns the plain UseQueryResult; render it with <QueryState query={q}>{(data) => ...}</QueryState>.
import {
  qk,
  type InsightsInput,
  type OrderFilter,
  type Period,
  type ReportFilters,
  type ShiftReportInput,
} from '@rota/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useApi } from './api';

/** Every directory plus settings. Fixed tables rarely change; equipment, employees and settings do. */
export function useDirectories() {
  const api = useApi();
  return useQuery({ queryKey: qk.directories(), queryFn: () => api.directories.get(), staleTime: 60_000 });
}

/** settings folded into one object (demo_mode, demo_time_scale, watchdog thresholds). */
export function useSettings() {
  const api = useApi();
  return useQuery({ queryKey: qk.settings(), queryFn: () => api.demo.settings() });
}

/** v_orders rows: emergency first, then by due_at. */
export function useOrders(filter: OrderFilter = {}) {
  const api = useApi();
  return useQuery({ queryKey: qk.orders('list', filter), queryFn: () => api.orders.list(filter) });
}

/** Board rows (active, rejected, done, ai_review, closed today); group them by board_column. */
export function useBoard(filters: ReportFilters = {}) {
  const api = useApi();
  return useQuery({
    queryKey: qk.orders('board', filters),
    queryFn: () => api.orders.forBoard(filters),
    placeholderData: keepPreviousData,
  });
}

/** The order card: v_orders row, events, photos, materials, every review. */
export function useOrder(id: number | null | undefined) {
  const api = useApi();
  return useQuery({
    queryKey: qk.order(id ?? -1),
    queryFn: () => api.orders.get(id as number),
    enabled: id != null && Number.isFinite(id),
  });
}

/** Latest AI review of an order, or null. */
export function useReview(orderId: number | null | undefined) {
  const api = useApi();
  return useQuery({
    queryKey: qk.reviews(orderId ?? -1),
    queryFn: () => api.ai.review(orderId as number),
    enabled: orderId != null,
  });
}

/** v_worker_status rows. */
export function useWorkerStatuses() {
  const api = useApi();
  return useQuery({ queryKey: qk.workers('status'), queryFn: () => api.workers.statuses() });
}

/** v_brigade_status rows (the «Бригады» tab of the assignee picker). */
export function useBrigadeStatuses() {
  const api = useApi();
  return useQuery({ queryKey: qk.brigades('status'), queryFn: () => api.workers.brigades() });
}

/** Top 3 candidates for a unit (CLAUDE.md §10); disabled until an equipment id is known. */
export function useSuggestAssignees(equipmentId: number | null | undefined, specialty?: string, exclude?: string) {
  const api = useApi();
  return useQuery({
    queryKey: qk.workers('suggest', equipmentId ?? null, specialty ?? null, exclude ?? null),
    queryFn: () => api.orders.suggestAssignees(equipmentId as number, specialty, exclude),
    enabled: equipmentId != null,
  });
}

/** Shift counters since `shiftStart` (pass shiftStart(now) from @rota/shared). */
export function useShiftCounters(shiftStart: Date) {
  const api = useApi();
  const iso = shiftStart.toISOString();
  return useQuery({ queryKey: qk.shift('counters', iso), queryFn: () => api.shift.counters(new Date(iso)) });
}

/** Unit history: orders newest first and total downtime minutes. */
export function useEquipmentHistory(id: number | null | undefined) {
  const api = useApi();
  return useQuery({
    queryKey: qk.equipment(id ?? -1),
    queryFn: () => api.equipment.history(id as number),
    enabled: id != null && Number.isFinite(id),
  });
}

/** Signed photo URLs, path → url. Signed URLs live an hour; the api caches them. */
export function usePhotoUrls(paths: readonly string[]) {
  const api = useApi();
  const sorted = [...paths].sort();
  return useQuery({
    queryKey: ['photos', ...sorted],
    queryFn: () => api.photos.urls(sorted),
    enabled: sorted.length > 0,
    staleTime: 30 * 60_000,
  });
}

/** rpc shift_report for the period and filter. */
export function useShiftReport(input: ShiftReportInput) {
  const api = useApi();
  return useQuery({
    queryKey: qk.reports('shift', input),
    queryFn: () => api.reports.shift(input),
    placeholderData: keepPreviousData,
  });
}

/** rpc rating: worker and brigade rows. */
export function useRating(period: Period, filters: ReportFilters = {}) {
  const api = useApi();
  return useQuery({
    queryKey: qk.rating(period, filters),
    queryFn: () => api.reports.rating(period, filters),
    placeholderData: keepPreviousData,
  });
}

/** rpc dashboard: the manager tiles. */
export function useDashboard(period: Period, filters: ReportFilters = {}) {
  const api = useApi();
  return useQuery({
    queryKey: qk.dashboard(period, filters),
    queryFn: () => api.reports.dashboard(period, filters),
    placeholderData: keepPreviousData,
  });
}

/** Insight cards for the period (rpc insight_cards now; LLM cards in Phase 6). */
export function useInsights(input: InsightsInput) {
  const api = useApi();
  return useQuery({
    queryKey: qk.insights(input),
    queryFn: () => api.ai.insights(input),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}

/** Own notifications, newest first. */
export function useNotifications() {
  const api = useApi();
  return useQuery({ queryKey: qk.notifications('list'), queryFn: () => api.notifications.list() });
}

export function useUnreadCount() {
  const api = useApi();
  return useQuery({ queryKey: qk.notifications('unread'), queryFn: () => api.notifications.unreadCount() });
}
