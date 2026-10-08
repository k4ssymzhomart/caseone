// /shift (master, manager): counters row, workers grid by state, live orders list (PHASE_0 §7.2, PHASE_2 §2.6).
// Data: useWorkerStatuses(), useShiftCounters(shiftStart(now)), useOrders({ statuses: ACTIVE_STATUSES }).
import { SHIFT_LABEL, shiftHours, shiftOf } from '@rota/shared';
import { Page, Placeholder } from '@/components/ui';
import { t } from '@/lib/i18n';

export function ShiftPage() {
  const shift = shiftOf(new Date());
  return (
    <Page title={t('page.shift')} eyebrow={`${SHIFT_LABEL[shift]} · ${shiftHours(shift)}`}>
      <Placeholder />
    </Page>
  );
}
