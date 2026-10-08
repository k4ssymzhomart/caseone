// /equipment/:id (master, manager): unit history: orders newest first, events, repairs, total downtime.
// Data: useEquipmentHistory(id).
import { Page, Placeholder } from '@/components/ui';
import { t } from '@/lib/i18n';

export function EquipmentPage() {
  return (
    <Page title={t('page.equipment')}>
      <Placeholder />
    </Page>
  );
}
