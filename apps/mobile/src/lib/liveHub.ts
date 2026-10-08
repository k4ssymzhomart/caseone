// One place where new own notifications and the realtime connection state arrive, whatever the API mode:
// SupabaseApi through createLiveSync (one channel per user), MockApi through api.realtime events.
import type { AppNotification, LiveStatus } from '@rota/shared';
import { create } from 'zustand';

type Listener = (n: AppNotification) => void;
const listeners = new Set<Listener>();

export const liveHub = {
  emitNotification(n: AppNotification): void {
    listeners.forEach((l) => {
      try {
        l(n);
      } catch {
        // a broken listener must not stop the others
      }
    });
  },
  onNotification(l: Listener): () => void {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};

export const useLiveStatus = create<{ status: LiveStatus; set: (s: LiveStatus) => void }>((set) => ({
  status: 'live',
  set: (status) => set({ status }),
}));
