// /admin/directories (admin): read only tables for every directory (areas, equipment, brigades, employees, fault
// codes, materials, work norms, problem templates). Data: useDirectories().
import { Page, Placeholder } from '@/components/ui';
import { t } from '@/lib/i18n';

export function DirectoriesPage() {
  return (
    <Page title={t('page.admin_directories')}>
      <Placeholder />
    </Page>
  );
}
