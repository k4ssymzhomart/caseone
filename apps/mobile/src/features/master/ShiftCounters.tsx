// The shift counters row (CLAUDE.md §10b): выдано, выполнено, просрочено, в простое since the shift start.
// The query key carries the shift start, so the row refetches by itself when the shift changes. An order going
// overdue changes no orders row (no realtime event): the overdue notification refetches it (NotificationBridge),
// and a 30 s poll covers the rest.
import { shiftStart } from '@rota/shared';
import { useQuery } from '@tanstack/react-query';

import { useApi } from '@/lib/api';
import { t } from '@/lib/i18n';
import { qk } from '@/lib/keys';
import { useTheme } from '@/lib/theme';
import { Card } from '@/ui/Card';
import { Counter } from '@/ui/Counter';

const COUNTERS_POLL_MS = 30_000;

export function useShiftCounters(now: Date) {
  const api = useApi();
  const start = shiftStart(now);
  const iso = start.toISOString();
  return useQuery({
    queryKey: qk.shiftCounters(iso),
    queryFn: () => api.shift.counters(start),
    refetchInterval: COUNTERS_POLL_MS,
  });
}

export interface ShiftCountersProps {
  now: Date;
  /** Tap on «Просрочено», e.g. to open the board on that column. */
  onOverduePress?: () => void;
}

export function ShiftCounters({ now, onOverduePress }: ShiftCountersProps) {
  const theme = useTheme();
  const q = useShiftCounters(now);
  const c = q.data;
  // While loading or after an error the row keeps its shape with «…».
  const value = (n: number | undefined) => (n === undefined ? '…' : n);
  const overdue = c?.overdue ?? 0;
  const stopped = c?.stopped ?? 0;

  return (
    <Card padded={false} style={{ flexDirection: 'row', paddingVertical: theme.space[3], paddingHorizontal: theme.space[2] }}>
      <Counter align="center" style={{ flex: 1 }} value={value(c?.issued)} label={t('master.counter.issued')} />
      <Counter align="center" style={{ flex: 1 }} value={value(c?.done)} label={t('master.counter.done')} />
      <Counter
        align="center"
        style={{ flex: 1 }}
        value={value(c?.overdue)}
        label={t('master.counter.overdue')}
        bad={overdue > 0}
        {...(onOverduePress && overdue > 0 ? { onPress: onOverduePress } : {})}
      />
      <Counter align="center" style={{ flex: 1 }} value={value(c?.stopped)} label={t('master.counter.stopped')} bad={stopped > 0} />
    </Card>
  );
}

