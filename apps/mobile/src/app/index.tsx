import { Redirect, type Href } from 'expo-router';

import { useSession, useSessionReady } from '@/lib/api';

/** Redirect by session: no session → login; worker, master, manager → their tabs; admin → the web panel note. */
export default function Index() {
  const ready = useSessionReady();
  const session = useSession();
  if (!ready) return null;
  if (!session) return <Redirect href={'/(auth)/login' as Href} />;
  switch (session.role) {
    case 'worker':
      return <Redirect href={'/(worker)' as Href} />;
    case 'master':
      return <Redirect href={'/(master)' as Href} />;
    case 'manager':
      return <Redirect href={'/(manager)' as Href} />;
    default:
      return <Redirect href={'/admin' as Href} />;
  }
}
