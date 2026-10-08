import { NavLink } from 'react-router';
import { useRequiredSession } from '@/lib/api';
import { t } from '@/lib/i18n';
import { NAV, paths } from '@/lib/routes';
import { LogoMark } from '../rota';
import styles from './layout.module.css';

/** Text only nav (no icons); the active row is filled with the accent tint, as in the Rota Settings window. */
export function Sidebar() {
  const { role } = useRequiredSession();
  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((i) => (i.roles as readonly string[]).includes(role)) })).filter(
    (g) => g.items.length > 0,
  );
  return (
    <nav className={styles.sidebar} aria-label={t('app.name')}>
      <div className={styles.navGroups}>
        {groups.map((g) => (
          <div key={g.label} className={styles.navGroup}>
            <span className={styles.navGroupLabel}>{t(g.label)}</span>
            {g.items.map((item) => (
              <NavLink key={item.to} to={item.to} className={styles.navItem}>
                {t(item.label)}
              </NavLink>
            ))}
          </div>
        ))}
      </div>
      <div className={styles.sidebarFoot}>
        <NavLink to={paths.kit} className={styles.navItem}>
          {t('nav.kit')}
        </NavLink>
        <span className={styles.version}>
          <LogoMark size={14} />
          {t('nav.version')}
        </span>
      </div>
    </nav>
  );
}
