// Realtime → React Query (PHASE_2 §2.1 wiring on mobile). The API emits topic events (MockApi after every
// mutation, SupabaseApi from the rota-live channel); each event invalidates its keys, debounced 250 ms.
// Coming back to the foreground resyncs everything: a locked phone drops the socket.
import { REALTIME_TOPICS, type RealtimeTopic } from '@rota/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useApi, useSession } from '@/lib/api';
import { TOPIC_KEYS } from '@/lib/keys';

export function LiveBridge() {
  const api = useApi();
  const qc = useQueryClient();
  const session = useSession();
  const uid = session?.user_id ?? null;

  useEffect(() => {
    if (!uid) return;
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
    const offs = REALTIME_TOPICS.map((topic) => api.realtime.subscribe(topic, () => invalidate(topic)));
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
  }, [api, qc, uid]);

  return null;
}
