// Realtime → React Query (PHASE_2 §2.1, mobile wiring). Supabase mode: createLiveSync opens one channel per
// user and hands back the keys to invalidate, already debounced. Mock mode: the API's own events.
// Coming back from the background rebuilds the socket and the channel (CLAUDE.md §8: a locked phone drops the
// socket, or leaves it half open so it still looks joined); the new channel's SUBSCRIBED resyncs everything.
// While the channel is down the HUD keeps a «Нет связи» capsule up (LiveHudProvider).
import { createLiveSync, REALTIME_TOPICS, type AppNotification, type RealtimeTopic } from '@rota/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { apiMode, useApi, useSession } from '@/lib/api';
import { t } from '@/lib/i18n';
import { TOPIC_KEYS } from '@/lib/keys';
import { liveHub, useLiveStatus } from '@/lib/liveHub';
import { supabase } from '@/lib/supabase';
import { HudProvider, type HudShowOptions } from '@/ui/Hud';

/** How long a socket teardown may take before the new channel goes out anyway (phoenix gives up after about 3 s). */
const SOCKET_DROP_TIMEOUT_MS = 4000;

export function LiveBridge() {
  const api = useApi();
  const qc = useQueryClient();
  const session = useSession();
  const uid = session?.user_id ?? null;
  const setStatus = useLiveStatus((s) => s.set);

  useEffect(() => {
    if (!uid) return;

    if (apiMode === 'supabase' && supabase) {
      const client = supabase;
      let disposed = false;
      const start = () =>
        createLiveSync({
          client,
          uid,
          onInvalidate: (keys) => keys.forEach((queryKey) => void qc.invalidateQueries({ queryKey: [...queryKey] })),
          onNotification: (row) => liveHub.emitNotification(row),
          onStatus: setStatus,
        });
      let live = start();
      let restarting = false;
      let wasBackground = false;

      // Drop the old socket so the new channel joins on a fresh one instead of waiting one or two missed
      // heartbeats (25 s each) to notice a dead connection.
      const restart = () => {
        if (restarting) return;
        restarting = true;
        live.stop();
        const timeout = new Promise<void>((resolve) => setTimeout(resolve, SOCKET_DROP_TIMEOUT_MS));
        const drop = client.realtime.disconnect().then(
          () => undefined,
          () => undefined,
        );
        void Promise.race([drop, timeout]).then(() => {
          restarting = false;
          if (!disposed) live = start();
        });
      };

      const sub = AppState.addEventListener('change', (state) => {
        if (state === 'background') {
          wasBackground = true;
          return;
        }
        if (state !== 'active') return;
        if (wasBackground) restart();
        else live.resync();
        wasBackground = false;
      });
      const offResync = liveHub.setResync(() => live.resync());
      return () => {
        disposed = true;
        sub.remove();
        offResync();
        live.stop();
        setStatus('live');
      };
    }

    // Mock mode: every mutation emits a topic event; debounce the invalidations 250 ms per key.
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const invalidate = (topic: RealtimeTopic) => {
      for (const key of TOPIC_KEYS[topic]) {
        const id = JSON.stringify(key);
        const prev = timers.get(id);
        if (prev) clearTimeout(prev);
        timers.set(
          id,
          setTimeout(() => {
            timers.delete(id);
            void qc.invalidateQueries({ queryKey: [...key] });
          }, 250),
        );
      }
    };
    const offs = REALTIME_TOPICS.map((topic) =>
      api.realtime.subscribe(topic, (e) => {
        invalidate(topic);
        if (topic === 'notifications' && e.type === 'INSERT' && e.row) {
          liveHub.emitNotification(e.row as AppNotification);
        }
      }),
    );
    const resyncAll = () => {
      api.realtime.resync();
      void qc.invalidateQueries();
    };
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') resyncAll();
    });
    const offResync = liveHub.setResync(resyncAll);
    return () => {
      offs.forEach((off) => off());
      sub.remove();
      offResync();
      timers.forEach(clearTimeout);
    };
  }, [api, qc, uid, setStatus]);

  return null;
}

/**
 * HudProvider with the connection capsule: «Нет связи» stays at the HUD spot while signed in and the live channel
 * is down (PHASE_2 §2.1); a toast takes its place for a moment and it comes back after.
 */
export function LiveHudProvider({ children }: { children: ReactNode }) {
  const status = useLiveStatus((s) => s.status);
  const signedIn = useSession() !== null;
  const offline = signedIn && status === 'offline';
  const persistent = useMemo<HudShowOptions | null>(
    () => (offline ? { message: t('hud.offline'), tone: 'critical' } : null),
    [offline],
  );
  return <HudProvider persistent={persistent}>{children}</HudProvider>;
}
