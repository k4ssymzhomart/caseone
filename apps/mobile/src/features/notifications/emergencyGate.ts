// One red screen per emergency order. The realtime notification, a tap on the system push and the foreground
// check can all ask for the same order within a second (or again while it is on screen after an unlock);
// the emergency screen registers itself here while mounted, and the openers skip an order that is showing.
import { router, type Href } from 'expo-router';

const shown = new Set<string>();
/** Orders being accepted from a system notification's «Принять»: the foreground check must not alarm again. */
const accepting = new Set<string>();

/** The emergency screen calls this on mount; the returned function unregisters it on unmount. */
export function registerEmergencyScreen(id: string): () => void {
  shown.add(id);
  return () => {
    shown.delete(id);
  };
}

export function isEmergencyShown(id: string | number): boolean {
  return shown.has(String(id));
}

/** Marks an order as being accepted (notification action); the returned function clears the mark. */
export function markAccepting(id: string | number): () => void {
  const key = String(id);
  accepting.add(key);
  return () => {
    accepting.delete(key);
  };
}

/** Pushes /emergency/{id} unless that screen is already open or the order is being accepted right now. */
export function openEmergency(id: string | number): void {
  if (isEmergencyShown(id) || accepting.has(String(id))) return;
  router.push(`/emergency/${id}` as Href);
}

/** /emergency/{id} of a notification url, or null for any other route. */
export function emergencyIdOf(url: string): string | null {
  const m = /^\/emergency\/([^/?#]+)/.exec(url);
  return m?.[1] ?? null;
}
