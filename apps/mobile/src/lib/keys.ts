// React Query keys. They match the invalidation map of PHASE_2 §2.1 (createLiveSync), so a realtime
// event refetches exactly what it changed.
export const qk = {
  session: ['session'] as const,
  directories: ['directories'] as const,
  orders: ['orders'] as const,
  ordersList: (filter: unknown) => ['orders', 'list', filter] as const,
  board: (filters: unknown) => ['orders', 'board', filters] as const,
  order: (id: number) => ['order', id] as const,
  reviews: (id: number) => ['reviews', id] as const,
  workers: ['workers'] as const,
  brigades: ['brigades'] as const,
  suggest: (equipmentId: number, specialty: string | null) => ['workers', 'suggest', equipmentId, specialty] as const,
  shift: ['shift'] as const,
  shiftCounters: (start: string) => ['shift', 'counters', start] as const,
  equipment: (id: number) => ['equipment', id] as const,
  dashboard: (from: string) => ['dashboard', from] as const,
  rating: (from: string, who: string | null) => ['rating', from, who] as const,
  notifications: ['notifications'] as const,
  settings: ['settings'] as const,
  photoUrls: (paths: readonly string[]) => ['photos', ...paths] as const,
};

/** Realtime topic → the keys it invalidates. */
export const TOPIC_KEYS = {
  orders: [['orders'], ['order'], ['workers'], ['brigades'], ['equipment'], ['dashboard'], ['shift']],
  workers: [['workers'], ['brigades']],
  reviews: [['order'], ['reviews']],
  notifications: [['notifications'], ['orders'], ['order']],
} as const;
