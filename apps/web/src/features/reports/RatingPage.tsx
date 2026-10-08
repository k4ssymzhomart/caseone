// /reports/rating (master, manager): workers and brigades tabs, a table with the components Q T F V D and a stacked
// bar chart (lib/chart.ts stackedBarProps, components/chart ChartCard). Demo step 8 uses «Месяц».
// Data: const { period, filters } = useReportFilter(); useRating(period, filters).
import { Page, Placeholder } from '@/components/ui';
import { t } from '@/lib/i18n';

export function RatingPage() {
  return (
    <Page title={t('page.reports_rating')}>
      <Placeholder />
    </Page>
  );
}
