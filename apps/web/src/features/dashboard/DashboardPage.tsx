// /dashboard (manager): the case's tiles: наряды в работе, просрочки, среднее время реакции и выполнения, простой
// оборудования, топ 5 проблемного оборудования, лучшие исполнители. Period switch смена, неделя, месяц (the route
// handle limits the FilterBar to those presets).
// Data: const { period, filters } = useReportFilter(); useDashboard(period, filters).
import { Page, Placeholder } from '@/components/ui';
import { t } from '@/lib/i18n';

export function DashboardPage() {
  return (
    <Page title={t('page.dashboard')}>
      <Placeholder />
    </Page>
  );
}
