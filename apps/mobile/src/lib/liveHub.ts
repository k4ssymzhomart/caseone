// One place where new own notifications and the realtime connection state arrive, whatever the API mode:
// SupabaseApi through createLiveSync (one channel per user), MockApi through api.realtime events.
import type { AppNotification, LiveStatus } from '@rota/shared';
import { create } from 'zustand';

type Listener = (n: AppNotification) => void;
const listeners = new Set<Listener>();
const noop = () => undefined;
let resyncImpl: () => void = noop;

export const liveHub = {
  /**
   * Refetch everything the live sync covers (pull to refresh, PHASE_2 §2.5): createLiveSync.resync() in supabase
   * mode, the mock's resync plus a full invalidation otherwise. A no op while signed out.
   */
  resync(): void {
    resyncImpl();
  },
  /** LiveBridge registers the current live sync; the returned function unregisters it. */
  setResync(fn: () => void): () => void {
    resyncImpl = fn;
    return () => {
      if (resyncImpl === fn) resyncImpl = noop;
    };
  },
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
