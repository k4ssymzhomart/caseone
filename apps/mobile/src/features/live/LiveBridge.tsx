// Realtime → React Query (PHASE_2 §2.1, mobile wiring). Supabase mode: createLiveSync opens one channel per
// user and hands back the keys to invalidate, already debounced. Mock mode: the API's own events.
// Coming back to the foreground resyncs everything: a locked phone drops the socket.
import { createLiveSync, REALTIME_TOPICS, type AppNotification, type RealtimeTopic } from '@rota/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { apiMode, useApi, useSession } from '@/lib/api';
import { t } from '@/lib/i18n';
import { TOPIC_KEYS } from '@/lib/keys';
import { liveHub, useLiveStatus } from '@/lib/liveHub';
import { supabase } from '@/lib/supabase';
import { useHud } from '@/ui/Hud';

export function LiveBridge() {
  const api = useApi();
  const qc = useQueryClient();
  const hud = useHud();
  const session = useSession();
  const uid = session?.user_id ?? null;
  const setStatus = useLiveStatus((s) => s.set);
  const lastStatus = useRef<string>('live');

  useEffect(() => {
    if (!uid) return;

    if (apiMode === 'supabase' && supabase) {
      const live = createLiveSync({
        client: supabase,
        uid,
        onInvalidate: (keys) => keys.forEach((queryKey) => void qc.invalidateQueries({ queryKey: [...queryKey] })),
        onNotification: (row) => liveHub.emitNotification(row),
        onStatus: (s) => {
          setStatus(s);
          if (s === 'offline' && lastStatus.current !== 'offline') {
            hud.show({ message: t('hud.offline'), tone: 'critical', duration: 3000 });
          }
          lastStatus.current = s;
        },
      });
      const sub = AppState.addEventListener('change', (state) => {
        if (state === 'active') live.resync();
      });
      return () => {
        sub.remove();
        live.stop();
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
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        api.realtime.resync();
        void qc.invalidateQueries();
      }
    });
    return () => {
      offs.forEach((off) => off());
      sub.remove();
      timers.forEach(clearTimeout);
    };
  }, [api, qc, uid, hud, setStatus]);

  return null;
}
