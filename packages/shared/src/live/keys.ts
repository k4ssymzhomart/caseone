// React Query keys shared by both apps and createLiveSync (PHASE_2 §2.1, §2.2), so a realtime event invalidates
// exactly the queries the screens use. Every key starts with one of the roots below; React Query matches by
// prefix, so invalidating ['orders'] refreshes every ['orders', filter] query and ['order'] every single order.
//
//   useQuery({ queryKey: qk.orders({ assignee_id }), queryFn: () => api.orders.list({ assignee_id }) })
//   useQuery({ queryKey: qk.order(id), queryFn: () => api.orders.get(id) })

/** A React Query key: a root name, then optional parts. */
export type QueryKey = readonly [string, ...unknown[]];

export const QUERY_ROOTS = [
  'orders',
  'order',
  'workers',
  'brigades',
  'equipment',
  'dashboard',
  'shift',
  'reviews',
  'notifications',
  'directories',
  'settings',
  'reports',
  'rating',
  'insights',
] as const;
export type QueryRoot = (typeof QUERY_ROOTS)[number];

export const qk = {
  /** orders.list(filter) and orders.forBoard(filters). */
  orders: (...parts: unknown[]) => ['orders', ...parts] as const,
  /** orders.get(id): the order card with events, photos, materials and reviews. */
  order: (id?: number) => (id == null ? (['order'] as const) : (['order', id] as const)),
  /** workers.statuses(). */
  workers: (...parts: unknown[]) => ['workers', ...parts] as const,
  /** workers.brigades(). */
  brigades: (...parts: unknown[]) => ['brigades', ...parts] as const,
  /** equipment.history(id) and the equipment list with is_stopped. */
  equipment: (id?: number) =>
    id == null ? (['equipment'] as const) : (['equipment', id] as const),
  /** reports.dashboard(period, filters). */
  dashboard: (...parts: unknown[]) => ['dashboard', ...parts] as const,
  /** shift.counters(start). */
  shift: (...parts: unknown[]) => ['shift', ...parts] as const,
  /** ai.review(orderId). */
  reviews: (orderId?: number) =>
    orderId == null ? (['reviews'] as const) : (['reviews', orderId] as const),
  /** notifications.list() and unreadCount(). */
  notifications: (...parts: unknown[]) => ['notifications', ...parts] as const,
  /** directories.get(). */
  directories: () => ['directories'] as const,
  /** demo.settings(). */
  settings: () => ['settings'] as const,
  /** reports.shift(input). */
  reports: (...parts: unknown[]) => ['reports', ...parts] as const,
  /** reports.rating(period, filters). */
  rating: (...parts: unknown[]) => ['rating', ...parts] as const,
  /** ai.insights(input). */
  insights: (...parts: unknown[]) => ['insights', ...parts] as const,
} as const;

/** Every root once: what resync() invalidates. */
export const ALL_ROOT_KEYS: readonly QueryKey[] = QUERY_ROOTS.map((root) => [root] as const);

/** Stable string of a key, for maps and dedupe. */
export function keyId(key: QueryKey): string {
  return JSON.stringify(key);
}
