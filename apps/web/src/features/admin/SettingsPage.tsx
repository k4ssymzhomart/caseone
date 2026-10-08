// /admin/settings (admin): watchdog thresholds as Settings Rows (SettingsGroup, SettingsRow from components/rota).
// Data: useSettings(); writes through useUpdateSettings() (set_setting per key).
import { Page, Placeholder } from '@/components/ui';
import { t } from '@/lib/i18n';

export function SettingsPage() {
  return (
    <Page title={t('page.admin_settings')}>
      <Placeholder />
    </Page>
  );
}
