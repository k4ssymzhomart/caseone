// The counters row of the shift (CLAUDE.md §10b): выдано, выполнено since the shift start; просрочено and
// оборудование в простое now. Shown on /shift and /board; live sync refreshes it through the ['shift'] key.
import { formatInt, hhmm, shiftStart } from '@rota/shared';
import { Kpi } from '@/components/ui';
import { useShiftCounters } from '@/lib/queries';
import { t } from './strings';
import styles from './shift.module.css';

export function ShiftCounters({ now }: { now: Date }) {
  const start = shiftStart(now);
  const q = useShiftCounters(start);
  const c = q.data;
  const since = t('shift.counter.since', { time: hhmm(start) });
  const value = (n: number | undefined) => (n == null ? '…' : formatInt(n));
  const failed = q.isError && !c;
  return (
    <div className={styles.counters}>
      <Kpi label={t('shift.counter.issued')} value={value(c?.issued)} hint={failed ? t('shift.counter.error') : since} />
      <Kpi label={t('shift.counter.done')} value={value(c?.done)} hint={since} />
      <Kpi
        label={t('shift.counter.overdue')}
        value={value(c?.overdue)}
        hint={t('shift.counter.now')}
        tone={c && c.overdue > 0 ? 'critical' : 'default'}
      />
      <Kpi
        label={t('shift.counter.stopped')}
        value={value(c?.stopped)}
        hint={t('shift.counter.now')}
        tone={c && c.stopped > 0 ? 'critical' : 'default'}
      />
    </div>
  );
}
