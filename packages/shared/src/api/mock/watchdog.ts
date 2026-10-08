// The mock watchdog: internal.watchdog_tick() of 20261008100008_rota_watchdog.sql over the store, with the
// same rules, thresholds (divided by settings.demo_time_scale), dedupe keys and real minutes in the texts:
//   1. not accepted in time → escalation to the master with the best other candidate, reminder to the worker
//   2. deadline close (least(remind_before, half the window)) → reminder
//   3. overdue → overdue to the worker and the issuing master, repeated every overdue_repeat
//   4. long overdue → manager_overdue to every manager, once per order
//   5. stuck AI check (ai_review for 60 s without a review of the current attempt) → the caller reruns the check

import { ACTIVE_STATUSES, type Status } from '../../domain/enums';
import { suggestAssignees } from '../../domain/suggest';
import { DEDUPE_KEY, escalationReason, overdueRepeatIndex } from '../../domain/templates';
import { deriveWorkerStatuses } from '../../domain/workerStatus';
import { hhmm } from '../../format/time';
import type { Change } from './events';
import type { MockDb } from './store';

const MIN = 60_000;

export interface WatchdogResult {
  changes: Change[];
  /** Orders whose AI check is stuck: rerun it (rule 5). */
  stuck: number[];
}

const isActive = (s: Status): boolean => (ACTIVE_STATUSES as readonly Status[]).includes(s);

export function watchdogTick(db: MockDb, now: Date): WatchdogResult {
  const { state } = db;
  const t = now.getTime();
  const st = state.settings;
  const s = Math.max(Number(st.demo_time_scale) || 1, 1);
  const remindMs = (st.remind_before_min * MIN) / s;
  const acceptMs = (st.accept_timeout_min * MIN) / s;
  const acceptEmergencyMs = (st.accept_timeout_emergency_min * MIN) / s;
  const repeatSec = (st.overdue_repeat_min * 60) / s;
  const managerMs = (st.manager_overdue_min * MIN) / s;
  const changes: Change[] = [];
  const push = (row: ReturnType<MockDb['notify']>): void => {
    if (row) changes.push({ topic: 'notifications', type: 'INSERT', row });
  };

  // 1. not accepted in time
  const workers = deriveWorkerStatuses(state.employees, state.orders, state.equipment);
  for (const o of state.orders) {
    if (o.status !== 'issued') continue;
    const waited = t - Date.parse(o.issued_at);
    if (waited <= (o.priority === 'emergency' ? acceptEmergencyMs : acceptMs)) continue;
    const key = DEDUPE_KEY.escalation(o.id, o.assignee_id);
    if (state.notifications.some((n) => n.recipient_id === o.master_id && n.dedupe_key === key))
      continue;
    const cand = suggestAssignees({
      equipment_id: o.equipment_id,
      required_specialty: null,
      exclude: o.assignee_id,
      directories: {
        equipment: state.equipment,
        equipment_type_specialty: db.dirs.equipment_type_specialty,
      },
      workers,
      orders: state.orders,
      now,
    })[0];
    push(
      db.notify(
        o.master_id,
        o,
        'escalation',
        key,
        {
          minutes: Math.floor(waited / MIN),
          cand_short_name: cand?.short_name ?? null,
          cand_reason: cand ? escalationReason(cand.reasons) : null,
          url: cand ? `/order/${o.id}?reassign=${cand.employee_id}` : null,
        },
        now,
      ),
    );
    const due = Date.parse(o.due_at);
    if (due > t) {
      push(
        db.notify(
          o.assignee_id,
          o,
          'reminder',
          DEDUPE_KEY.escalationReminder(o.id, o.assignee_id),
          { minutes: Math.max(1, Math.ceil((due - t) / MIN)) },
          now,
        ),
      );
    }
  }

  // 2. deadline close
  for (const o of state.orders) {
    if (!isActive(o.status)) continue;
    const due = Date.parse(o.due_at);
    if (due <= t) continue;
    if (due - t > Math.min(remindMs, (due - Date.parse(o.issued_at)) * 0.5)) continue;
    push(
      db.notify(
        o.assignee_id,
        o,
        'reminder',
        DEDUPE_KEY.reminder(o.id, o.due_at),
        { minutes: Math.max(1, Math.ceil((due - t) / MIN)) },
        now,
      ),
    );
  }

  // 3. and 4. overdue
  const managers = state.employees.filter((e) => e.role === 'manager');
  for (const o of state.orders) {
    if (!isActive(o.status)) continue;
    const due = Date.parse(o.due_at);
    if (t <= due) continue;
    const k = overdueRepeatIndex(o.due_at, now, repeatSec);
    let since: number | null = null;
    for (const e of state.events) {
      if (e.order_id !== o.id || e.to_status === e.from_status) continue;
      const at = Date.parse(e.created_at);
      if (since == null || at > since) since = at;
    }
    const key = DEDUPE_KEY.overdue(o.id, o.due_at, k);
    const vars = {
      minutes: Math.max(1, Math.floor((t - due) / MIN)),
      status_since: hhmm(since ?? o.issued_at),
    };
    push(db.notify(o.assignee_id, o, 'overdue', key, vars, now));
    push(db.notify(o.master_id, o, 'overdue', key, vars, now));
    if (t - due > managerMs) {
      for (const m of managers) {
        push(
          db.notify(
            m.id,
            o,
            'manager_overdue',
            DEDUPE_KEY.managerOverdue(o.id),
            { minutes: Math.floor((t - due) / MIN) },
            now,
          ),
        );
      }
    }
  }

  // 5. stuck AI check
  const stuck: number[] = [];
  for (const o of state.orders) {
    if (o.status !== 'ai_review' || db.reviewFor(o.id, o.rework_count + 1)) continue;
    let started: number | null = null;
    for (const e of state.events) {
      if (e.order_id !== o.id || e.action !== 'review_started') continue;
      const at = Date.parse(e.created_at);
      if (started == null || at > started) started = at;
    }
    if (started != null && started < t - 60_000) stuck.push(o.id);
  }

  return { changes, stuck };
}
