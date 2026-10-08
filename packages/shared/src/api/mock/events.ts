// Realtime for MockApi: a topic bus on this device. Every mutation reports its row changes; MockApi publishes
// the ones the signed-in user could see through RLS (own orders for a worker, own notifications only), the same
// events SupabaseApi gets from postgres_changes: orders INSERT and UPDATE, notifications INSERT, ai_reviews INSERT,
// employees UPDATE (topic 'workers'). resync() sends every subscriber a refresh event without a row.

import type {
  AiReview,
  AppNotification,
  Employee,
  Order,
  RealtimeEvent,
  RealtimeTopic,
  Unsubscribe,
} from '../../domain/types';
import { REALTIME_TOPICS } from '../../domain/types';

/** One row change of a mutation, before the visibility filter. */
export type Change =
  | { topic: 'orders'; type: 'INSERT' | 'UPDATE'; row: Order }
  | { topic: 'notifications'; type: 'INSERT'; row: AppNotification }
  | { topic: 'reviews'; type: 'INSERT'; row: AiReview }
  | { topic: 'workers'; type: 'UPDATE'; row: Employee };

type Listener = (e: RealtimeEvent) => void;

export class RealtimeBus {
  private readonly listeners = new Map<RealtimeTopic, Set<Listener>>();

  subscribe(topic: RealtimeTopic, cb: Listener): Unsubscribe {
    let set = this.listeners.get(topic);
    if (!set) {
      set = new Set();
      this.listeners.set(topic, set);
    }
    set.add(cb);
    return () => {
      set.delete(cb);
    };
  }

  emit(event: RealtimeEvent): void {
    const set = this.listeners.get(event.topic);
    if (!set) return;
    for (const cb of [...set]) {
      try {
        cb(event);
      } catch {
        // a failing subscriber must not break the mutation that emitted
      }
    }
  }

  /** A refresh event (type UPDATE, no row) on every topic. */
  resync(): void {
    for (const topic of REALTIME_TOPICS) this.emit({ topic, type: 'UPDATE' });
  }

  clear(): void {
    this.listeners.clear();
  }
}
