// Paths, who may open them, the sidebar and the landing page per role (CLAUDE.md §18: master → /shift,
// manager → /dashboard, admin → /admin/directories; workers use the phone app only).
import type { Role } from '@rota/shared';
import type { WebKey } from './strings';

export const paths = {
  login: '/login',
  kit: '/kit',
  shift: '/shift',
  board: '/board',
  order: (id: number | string) => `/orders/${id}`,
  reportsShift: '/reports/shift',
  reportsRating: '/reports/rating',
  analytics: '/analytics',
  dashboard: '/dashboard',
  equipment: (id: number | string) => `/equipment/${id}`,
  adminDirectories: '/admin/directories',
  adminSettings: '/admin/settings',
  adminAi: '/admin/ai',
  demo: '/demo',
} as const;

export type PanelRole = Exclude<Role, 'worker'>;

export const MASTER: readonly PanelRole[] = ['master'];
export const STAFF: readonly PanelRole[] = ['master', 'manager'];
export const ADMIN: readonly PanelRole[] = ['admin'];
export const DEMO_ROLES: readonly PanelRole[] = ['master', 'admin'];
export const ALL_PANEL: readonly PanelRole[] = ['master', 'manager', 'admin'];

export function homeFor(role: Role): string {
  switch (role) {
    case 'master':
      return paths.shift;
    case 'manager':
      return paths.dashboard;
    case 'admin':
      return paths.adminDirectories;
    case 'worker':
      return paths.login;
  }
}

export interface NavItem {
  to: string;
  label: WebKey;
  roles: readonly PanelRole[];
}

export interface NavGroup {
  label: WebKey;
  items: readonly NavItem[];
}

/** The sidebar, filtered by role at render. Detail pages (/orders/:id, /equipment/:id) are not in it. */
export const NAV: readonly NavGroup[] = [
  {
    label: 'nav.group.work',
    items: [
      { to: paths.dashboard, label: 'nav.dashboard', roles: ['manager'] },
      { to: paths.shift, label: 'nav.shift', roles: STAFF },
      { to: paths.board, label: 'nav.board', roles: STAFF },
    ],
  },
  {
    label: 'nav.group.reports',
    items: [
      { to: paths.reportsShift, label: 'nav.reports_shift', roles: STAFF },
      { to: paths.reportsRating, label: 'nav.reports_rating', roles: STAFF },
      { to: paths.analytics, label: 'nav.analytics', roles: STAFF },
    ],
  },
  {
    label: 'nav.group.admin',
    items: [
      { to: paths.adminDirectories, label: 'nav.admin_directories', roles: ADMIN },
      { to: paths.adminSettings, label: 'nav.admin_settings', roles: ADMIN },
      { to: paths.adminAi, label: 'nav.admin_ai', roles: ADMIN },
      { to: paths.demo, label: 'nav.demo', roles: DEMO_ROLES },
    ],
  },
];

/**
 * Notification URLs from the database are mobile routes (CLAUDE.md §8): /order/{id}, /order/{id}/review,
 * /emergency/{id}, /order/{id}?reassign={employee_id}. The panel shows all of them on /orders/{id}, keeping the query.
 */
export function webUrlFromNotification(url: string | null | undefined): string | null {
  if (!url) return null;
  const [path = '', query] = url.split('?');
  const m = /^\/(?:order|emergency)\/(\d+)(?:\/review)?\/?$/.exec(path);
  if (!m) return null;
  return `${paths.order(m[1]!)}${query ? `?${query}` : ''}`;
}
