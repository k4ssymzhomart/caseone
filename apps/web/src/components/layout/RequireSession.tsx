// Route guard by role (CLAUDE.md §18). No session → /login?next=…; a worker → /login?blocked=worker, where the login
// page signs them out with «Исполнители работают в мобильном приложении»; a role not allowed here → that role's home.
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useSession, useSessionReady } from '@/lib/api';
import { homeFor, paths, type PanelRole } from '@/lib/routes';
import { Loading } from '../ui';
import styles from './layout.module.css';

export const WORKER_BLOCKED = 'worker';

interface Props {
  /** Roles that may open the route; omit for any panel role. */
  roles?: readonly PanelRole[];
  children: ReactNode;
}

export function RequireSession({ roles, children }: Props) {
  const ready = useSessionReady();
  const session = useSession();
  const location = useLocation();
  const isWorker = session?.role === 'worker';

  if (!ready) {
    return (
      <div className={styles.splash}>
        <Loading />
      </div>
    );
  }
  if (!session || isWorker) {
    const next = `${location.pathname}${location.search}`;
    const search = new URLSearchParams();
    if (isWorker) search.set('blocked', WORKER_BLOCKED);
    else if (next !== '/' && next !== paths.login) search.set('next', next);
    const qs = search.toString();
    return <Navigate to={`${paths.login}${qs ? `?${qs}` : ''}`} replace />;
  }
  if (roles && !(roles as readonly string[]).includes(session.role)) {
    return <Navigate to={homeFor(session.role)} replace />;
  }
  return <>{children}</>;
}

/** `/`: the home page of the signed in role. */
export function HomeRedirect() {
  const session = useSession();
  return (
    <RequireSession>
      <Navigate to={session ? homeFor(session.role) : paths.login} replace />
    </RequireSession>
  );
}
