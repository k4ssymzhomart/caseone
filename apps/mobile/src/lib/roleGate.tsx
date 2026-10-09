// Route guard (CLAUDE.md §18): each role opens only its own screens. The tab bars and links never lead to
// another role's screen; this covers a typed URL (the web build) or a deep link (rota://board). The server
// still refuses the actions themselves (RLS and the role checks inside the RPCs).
import type { Role } from '@rota/shared';
import { Redirect, usePathname, type Href } from 'expo-router';
import { useRef, type ReactNode } from 'react';

import { useSession, useSessionReady } from './api';

/**
 * Home of a role: worker, master and manager tabs; the admin's note about the web panel; login without a session.
 * The groups are named on purpose: `/` from inside a group resolves to that group's own index route.
 */
export function homeHref(role: Role | null): Href {
  switch (role) {
    case null:
      return '/(auth)/login' as Href;
    case 'worker':
      return '/(worker)' as Href;
    case 'master':
      return '/(master)' as Href;
    case 'manager':
      return '/(manager)' as Href;
    default:
      return '/admin' as Href;
  }
}

/**
 * `/profile` is a tab of the worker, the master and the manager alike, so the URL cannot say whose: a refresh
 * there opens whichever group matches first. The person stays on their own profile instead of going home.
 */
function ownSharedTab(role: Role, pathname: string): Href | null {
  if (pathname !== '/profile' || role === 'admin') return null;
  return `/(${role})/profile` as Href;
}

export interface RoleGateProps {
  allow: readonly Role[];
  children: ReactNode;
}

/** Renders its children only for a session with one of the allowed roles; anyone else goes to their own home. */
export function RoleGate({ allow, children }: RoleGateProps) {
  const ready = useSessionReady();
  const session = useSession();
  const pathname = usePathname();
  const target = useRef<Href | null>(null);
  // A cold start on a deep link waits for the stored session instead of sending the person to login.
  if (!ready) return null;
  if (!session) return <Redirect href={homeHref(null)} />;
  if (!allow.includes(session.role)) {
    // Chosen once: while the redirect runs, this layout renders again with an in between pathname ('/').
    target.current ??= ownSharedTab(session.role, pathname) ?? homeHref(session.role);
    return <Redirect href={target.current} />;
  }
  return <>{children}</>;
}
