import { useNavigate } from 'react-router';
import { signOut, useRequiredSession } from '@/lib/api';
import { t } from '@/lib/i18n';
import { paths } from '@/lib/routes';
import { Button } from '../rota';
import styles from './layout.module.css';

function initials(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

/** Initials, short name and role, then «Выйти» (this browser only; the phone stays signed in). */
export function UserChip() {
  const s = useRequiredSession();
  const navigate = useNavigate();
  return (
    <div className={styles.user}>
      <span className={styles.avatar} aria-hidden="true">
        {initials(s.full_name || s.short_name)}
      </span>
      <span className={styles.userText}>
        <span className={styles.userName}>{s.short_name}</span>
        <span className={styles.userRole}>{t(`role.${s.role}`)}</span>
      </span>
      <Button
        variant="quiet"
        onClick={() => {
          void signOut().finally(() => navigate(paths.login, { replace: true }));
        }}
      >
        {t('topbar.sign_out')}
      </Button>
    </div>
  );
}
