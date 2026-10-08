// The signed in layout: top bar across (Lockup, the FilterBar row on report routes, live status, user chip, theme),
// the Rota Settings style sidebar on the left, the page on the right.
import { Outlet } from 'react-router';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import styles from './layout.module.css';

export function AppShell() {
  return (
    <div className={styles.shell}>
      <TopBar />
      <Sidebar />
      <main className={styles.main} id="main">
        <Outlet />
      </main>
    </div>
  );
}
