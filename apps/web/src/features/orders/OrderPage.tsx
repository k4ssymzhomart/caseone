// /orders/:id (master, manager): the master report layout: timeline, photos, materials, AI checks, actions
// (close, return, reassign with suggest_assignees and the brigades tab, cancel, priority, mark reject justified).
// Data: useOrder(id), usePhotoUrls(paths); actions through useOrderAction(). `?reassign={employee_id}` comes from
// escalation notifications (read it with useSearchParams).
import { Page, Placeholder } from '@/components/ui';
import { t } from '@/lib/i18n';

export function OrderPage() {
  return (
    <Page title={t('page.order_loading')}>
      <Placeholder />
    </Page>
  );
}
