// The router's root: live sync for the signed in user, the document title from the route handle, scroll to top on
// navigation.
import { useEffect } from 'react';
import { Outlet, useLocation, useMatches } from 'react-router';
import { tData } from '@/lib/i18n';
import type { RouteHandle } from '@/lib/filters';
import { LiveBridge } from '../LiveBridge';

export function RootLayout() {
  const matches = useMatches();
  const { pathname } = useLocation();
  const title = [...matches].reverse().find((m) => (m.handle as RouteHandle | undefined)?.title)?.handle as
    | RouteHandle
    | undefined;

  useEffect(() => {
    document.title = title?.title ? `${tData(title.title)} · Rota` : 'Rota';
  }, [title]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <>
      <LiveBridge />
      <Outlet />
    </>
  );
}

/** Pages with a dynamic title (Наряд №147) call this after their data loads. */
export function useDocumentTitle(title: string | null | undefined) {
  useEffect(() => {
    if (title) document.title = `${title} · Rota`;
  }, [title]);
}
