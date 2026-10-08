// /admin/ai (admin): «Что видит ИИ»: the latest llm_audit rows with the redacted payload, mascot shield.
import { EmptyState, Page } from '@/components/ui';
import { t } from '@/lib/i18n';

export function AiAuditPage() {
  return (
    <Page title={t('page.admin_ai')}>
      <EmptyState mascot="shield" title={t('state.placeholder_title')} text={t('state.placeholder_text')} />
    </Page>
  );
}
