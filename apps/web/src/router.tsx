// Every page of PHASE_0 §7.2, with its roles and handle (title key, report filter). Pages load lazily, one chunk
// each. To add a page: a component in src/features/<area>/, a route below with `roles` and `handle`, a NAV entry in
// lib/routes.ts if it belongs in the sidebar.
import type { ComponentType } from 'react';
import { createBrowserRouter, type RouteObject } from 'react-router';
import { AppShell, HomeRoute, RequireSession, RootLayout } from '@/components/layout';
import { Loading } from '@/components/ui';
import type { RouteHandle } from '@/lib/filters';
import { ADMIN, DEMO_ROLES, STAFF, type PanelRole } from '@/lib/routes';
import { NotFound } from '@/pages/NotFound';

/** A lazily loaded page behind the role guard. */
function page(
  path: string,
  load: () => Promise<ComponentType>,
  roles: readonly PanelRole[],
  handle: RouteHandle,
): RouteObject {
  return {
    path,
    handle,
    lazy: async () => {
      const Page = await load();
      return {
        Component: () => (
          <RequireSession roles={roles}>
            <Page />
          </RequireSession>
        ),
      };
    },
  };
}

const MANAGER: readonly PanelRole[] = ['manager'];

const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    HydrateFallback: () => <Loading />,
    children: [
      {
        path: '/login',
        handle: { title: 'page.login' } satisfies RouteHandle,
        lazy: async () => ({ Component: (await import('@/features/auth/LoginPage')).LoginPage }),
      },
      {
        path: '/kit',
        handle: { title: 'page.kit' } satisfies RouteHandle,
        lazy: async () => ({ Component: (await import('@/pages/Kit')).Kit }),
      },
      { path: '/', handle: { title: 'page.landing' } satisfies RouteHandle, element: <HomeRoute /> },
      {
        element: (
          <RequireSession>
            <AppShell />
          </RequireSession>
        ),
        children: [
          page('/shift', async () => (await import('@/features/shift/ShiftPage')).ShiftPage, STAFF, {
            title: 'page.shift',
          }),
          page('/board', async () => (await import('@/features/board/BoardPage')).BoardPage, STAFF, {
            title: 'page.board',
          }),
          page('/orders/:id', async () => (await import('@/features/orders/OrderPage')).OrderPage, STAFF, {
            title: 'page.order_loading',
          }),
          page(
            '/reports/shift',
            async () => (await import('@/features/reports/ShiftReportPage')).ShiftReportPage,
            STAFF,
            { title: 'page.reports_shift', filter: { defaultPreset: 'shift' } },
          ),
          page('/reports/rating', async () => (await import('@/features/reports/RatingPage')).RatingPage, STAFF, {
            title: 'page.reports_rating',
            filter: { defaultPreset: 'month' },
          }),
          page('/analytics', async () => (await import('@/features/analytics/AnalyticsPage')).AnalyticsPage, STAFF, {
            title: 'page.analytics',
            filter: { defaultPreset: 'month', fields: ['area', 'equipment', 'brigade'] },
          }),
          page('/dashboard', async () => (await import('@/features/dashboard/DashboardPage')).DashboardPage, MANAGER, {
            title: 'page.dashboard',
            filter: { presets: ['shift', 'week', 'month'], fields: ['area'], defaultPreset: 'month' },
          }),
          page('/equipment/:id', async () => (await import('@/features/equipment/EquipmentPage')).EquipmentPage, STAFF, {
            title: 'page.equipment',
          }),
          page(
            '/admin/directories',
            async () => (await import('@/features/admin/DirectoriesPage')).DirectoriesPage,
            ADMIN,
            { title: 'page.admin_directories' },
          ),
          page('/admin/settings', async () => (await import('@/features/admin/SettingsPage')).SettingsPage, ADMIN, {
            title: 'page.admin_settings',
          }),
          page('/admin/ai', async () => (await import('@/features/admin/AiAuditPage')).AiAuditPage, ADMIN, {
            title: 'page.admin_ai',
          }),
          page('/demo', async () => (await import('@/features/demo/DemoPage')).DemoPage, DEMO_ROLES, {
            title: 'page.demo',
          }),
          { path: '*', element: <NotFound />, handle: { title: 'page.not_found' } satisfies RouteHandle },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
