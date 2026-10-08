// Sign out (PHASE_2 §2.5): confirm sheet, unregister this phone's push token while the session still exists,
// leave the role screens, then end the session once they are gone. Screens below the role layouts may read
// useRequiredSession(), which throws without a session, so the session ends only after the navigation settles.
import { router, type Href } from 'expo-router';
import { useCallback, useState } from 'react';

import { api, signOut } from '@/lib/api';
import { t } from '@/lib/i18n';
import { useConfirm } from '@/ui/ConfirmSheet';

import { pushToken } from './push';

/** Long enough for the replace transition to finish and unmount the previous screens. */
const SETTLE_MS = 700;

let pending: Promise<void> | null = null;

/** Resolves when a sign out in progress has finished; the login screen awaits it before signing in again. */
export function pendingSignOut(): Promise<void> {
  return pending ?? Promise.resolve();
}

export async function signOutAndLeave(): Promise<void> {
  try {
    const token = await pushToken();
    if (token) await api.notifications.unregisterPushToken(token).catch(() => undefined);
  } catch {
    // never blocks the sign out
  }
  router.replace('/(auth)/login' as Href);
  pending = new Promise<void>((resolve) => {
    setTimeout(() => {
      signOut()
        .catch(() => undefined)
        .finally(() => {
          pending = null;
          resolve();
        });
    }, SETTLE_MS);
  });
  await pending;
}

/** «Выйти» with the destructive confirm sheet (glove mode). */
export function useSignOut(): { busy: boolean; run: () => Promise<void> } {
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);

  const run = useCallback(async () => {
    const ok = await confirm({
      title: t('profile.signOutTitle'),
      message: t('profile.signOutBody'),
      confirmLabel: t('profile.signOut'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await signOutAndLeave();
    } finally {
      setBusy(false);
    }
  }, [confirm]);

  return { busy, run };
}
