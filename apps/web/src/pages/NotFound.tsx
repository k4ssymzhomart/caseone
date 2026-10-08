import { Link } from 'react-router';
import { Button } from '@/components/rota';
import { EmptyState } from '@/components/ui';
import { t } from '@/lib/i18n';

export function NotFound() {
  return (
    <EmptyState
      mascot="oops"
      title={t('page.not_found')}
      text={t('state.not_found_text')}
      action={
        <Link to="/">
          <Button variant="secondary" tabIndex={-1}>
            {t('state.go_home')}
          </Button>
        </Link>
      }
    />
  );
}
