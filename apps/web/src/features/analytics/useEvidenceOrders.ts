// The orders behind the insight cards' «Доказательства»: evidence.order_ids are order ids, the panel shows order
// numbers, so the page loads v_orders once (lazily, when the first evidence panel opens) and looks them up.
// The window reaches 50 days back from the period end, because d_trend looks at the last 6 full weeks whatever the
// period. It starts at a local midnight so the key stays put while a rolling period moves, and sits under the
// 'insights' root: an id never changes its number, so order events need not refetch it.
import {
  qk,
  startOfLocalDay,
  type OrderFilter,
  type OrderView,
  type Period,
  type ReportFilters,
} from '@rota/shared';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '@/lib/api';

const DAY_MS = 86_400_000;

export type EvidenceOrder = Pick<
  OrderView,
  'id' | 'number' | 'type' | 'created_at' | 'equipment_name' | 'description'
>;

const toMap = (rows: OrderView[]): Map<number, EvidenceOrder> =>
  new Map(
    rows.map((o) => [
      o.id,
      {
        id: o.id,
        number: o.number,
        type: o.type,
        created_at: o.created_at,
        equipment_name: o.equipment_name,
        description: o.description,
      },
    ]),
  );

export function useEvidenceOrders(period: Period, filters: ReportFilters, enabled: boolean) {
  const api = useApi();
  const start = Math.min(Date.parse(period.from), Date.parse(period.to) - 50 * DAY_MS);
  const filter: OrderFilter = { since: startOfLocalDay(new Date(start)).toISOString() };
  if (filters.area_id != null) filter.area_id = filters.area_id;
  if (filters.equipment_id != null) filter.equipment_id = filters.equipment_id;
  return useQuery({
    queryKey: qk.insights('evidence', filter),
    queryFn: () => api.orders.list(filter),
    select: toMap,
    enabled,
    staleTime: 5 * 60_000,
  });
}
