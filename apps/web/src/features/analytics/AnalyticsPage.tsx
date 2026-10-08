// /analytics (master, manager): insight cards (severity, text, recommendation, «Доказательства» with links to
// /orders/:id), the ask box (disabled until Phase 6), mascot search while loading.
// Data: const { period, filters } = useReportFilter(); useInsights({ ...period, filters }).
import { Page, Placeholder } from '@/components/ui';
import { t } from '@/lib/i18n';

export function AnalyticsPage() {
  return (
    <Page title={t('page.analytics')}>
      <Placeholder />
    </Page>
  );
}
