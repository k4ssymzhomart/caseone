import { Redirect } from 'expo-router';

import { useSession, useSessionReady } from '@/lib/api';
import { homeHref } from '@/lib/roleGate';

/** Redirect by session: no session → login; worker, master, manager → their tabs; admin → the web panel note. */
export default function Index() {
  const ready = useSessionReady();
  const session = useSession();
  if (!ready) return null;
  return <Redirect href={homeHref(session?.role ?? null)} />;
}
