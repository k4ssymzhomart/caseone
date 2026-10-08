// /demo (master, admin): the same controls as mobile: «Демо режим», «Ускорение времени ×10» (useUpdateSettings),
// «Сбросить демо» (useDemoReset, danger with a confirm), link to «Что видит ИИ».
import { Page, Placeholder } from '@/components/ui';
import { t } from '@/lib/i18n';

export function DemoPage() {
  return (
    <Page title={t('page.demo')}>
      <Placeholder />
    </Page>
  );
}
