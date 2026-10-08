// /reports/shift (master, manager): FilterBar (top bar), KPI tiles, tables (workload, downtime, overdue, rejections
// with reasons), the AI summary block (placeholder with mascot read until Phase 5), «Скачать PDF» and «Скачать Excel».
// Data: const { period, filters } = useReportFilter(); useShiftReport({ ...period, filters }).
import { Page, Placeholder } from '@/components/ui';
import { t } from '@/lib/i18n';

export function ShiftReportPage() {
  return (
    <Page title={t('page.reports_shift')}>
      <Placeholder />
    </Page>
  );
}
