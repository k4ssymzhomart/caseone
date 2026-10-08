import { describe, expect, it } from 'vitest';
import { ACTIVE_STATUSES, ORDER_ACTIONS, ORDER_EVENT_ACTIONS, STATUSES } from './enums';
import { compareOrders, PRIORITY_LABEL } from './priority';
import { PAUSE_REASONS, REJECT_REASONS, reasonLabel } from './reasons';
import {
  BOARD_COLUMN_LABEL,
  boardColumn,
  isOverdue,
  STATUS_LABEL,
  statusTone,
  VERDICT_LABEL,
  workerStateText,
} from './status';
import { t } from '../i18n';
import { ru } from '../i18n/ru';
import { RotaError, parseAnotherInProgress } from '../api/errors';

const now = new Date('2026-10-08T10:00:00Z');
const future = '2026-10-08T12:00:00Z';
const past = '2026-10-08T09:00:00Z';

describe('status', () => {
  it('labels every status', () => {
    for (const s of STATUSES) expect(STATUS_LABEL[s]).toBeTruthy();
    expect(STATUS_LABEL.ai_review).toBe('Проверка ИИ');
    expect(t('status.rework')).toBe('На доработку');
  });

  it('overdue only for active statuses', () => {
    expect(isOverdue({ status: 'in_progress', due_at: past }, now)).toBe(true);
    expect(isOverdue({ status: 'done', due_at: past }, now)).toBe(false);
    expect(isOverdue({ status: 'issued', due_at: future }, now)).toBe(false);
    expect(ACTIVE_STATUSES).toEqual([
      'issued',
      'accepted',
      'queued',
      'in_progress',
      'paused',
      'rework',
    ]);
  });

  it('board column map of CLAUDE.md §6 (same as v_orders.board_column)', () => {
    const col = (status: (typeof STATUSES)[number], due = future) =>
      boardColumn({ status, due_at: due }, now);
    expect(col('issued')).toBe('issued');
    expect(col('rejected')).toBe('issued');
    expect(col('rejected', past)).toBe('issued'); // rejected is not active, never overdue
    expect(col('accepted')).toBe('accepted');
    expect(col('queued')).toBe('queued');
    expect(col('in_progress')).toBe('in_progress');
    expect(col('paused')).toBe('in_progress');
    expect(col('rework')).toBe('in_progress');
    expect(col('done')).toBe('done');
    expect(col('ai_review')).toBe('done');
    expect(col('closed')).toBe('done');
    expect(col('cancelled')).toBeNull();
    for (const s of ACTIVE_STATUSES) expect(col(s, past)).toBe('overdue');
    expect(BOARD_COLUMN_LABEL.overdue).toBe('Просрочены');
  });

  it('tones and verdicts', () => {
    expect(statusTone('in_progress')).toBe('working');
    expect(statusTone('rework')).toBe('critical');
    expect(VERDICT_LABEL.accepted_with_remarks).toBe('Принято с замечаниями');
  });

  it('worker state text', () => {
    expect(workerStateText({ status: 'free' })).toBe('Свободен');
    expect(workerStateText({ status: 'working', current_order_number: 147 })).toBe(
      'Выполняет наряд №147',
    );
    expect(workerStateText({ status: 'queue', queue_count: 2 })).toBe('В очереди 2');
    expect(workerStateText({ status: 'off' })).toBe('Не на смене');
  });
});

describe('enums', () => {
  it('client actions are the event actions minus create, review_started and ai_result', () => {
    const system = ['create', 'review_started', 'ai_result'];
    expect([...ORDER_ACTIONS].sort()).toEqual(
      ORDER_EVENT_ACTIONS.filter((a) => !system.includes(a)).sort(),
    );
  });
});

describe('reasons and priority', () => {
  it('labels', () => {
    expect(REJECT_REASONS.map((r) => r.label)).toEqual([
      'Нет материалов',
      'Нет допуска',
      'Занят аварийным',
      'Оборудование работает',
      'Другое',
    ]);
    expect(PAUSE_REASONS.map((r) => r.value)).toEqual([
      'waiting_parts',
      'waiting_stop',
      'waiting_permit',
      'other',
    ]);
    expect(reasonLabel('waiting_parts')).toBe('Ожидание запчастей');
    expect(reasonLabel('ждём подшипник')).toBe('ждём подшипник');
    expect(PRIORITY_LABEL.emergency).toBe('Аварийный');
  });

  it('emergency first, then due_at', () => {
    const rows = [
      { priority: 'normal' as const, due_at: '2026-10-08T09:00:00Z' },
      { priority: 'emergency' as const, due_at: '2026-10-08T11:00:00Z' },
      { priority: 'normal' as const, due_at: '2026-10-08T08:00:00Z' },
    ];
    expect([...rows].sort(compareOrders).map((r) => r.due_at)).toEqual([
      '2026-10-08T11:00:00Z',
      '2026-10-08T08:00:00Z',
      '2026-10-08T09:00:00Z',
    ]);
  });
});

describe('i18n and errors', () => {
  it('fills placeholders', () => {
    expect(t('error.NOT_ON_SHIFT', { name: 'Ахметов Е.' })).toBe(
      'Ахметов Е. не на смене. Всё равно выдать?',
    );
    expect(t('worker_state.working', { number: 147 })).toBe('Выполняет наряд №147');
  });

  it('RotaError messages from server details', () => {
    expect(new RotaError('WRONG_PIN').message).toBe('Неверный табельный номер или ПИН');
    expect(new RotaError('NOT_ON_SHIFT', { details: 'Ким Д.' }).message).toBe(
      'Ким Д. не на смене. Всё равно выдать?',
    );
    expect(new RotaError('NOT_ON_SHIFT').message).toBe(
      'Исполнитель не на смене. Всё равно выдать?',
    );
    const e = new RotaError('ANOTHER_IN_PROGRESS', { details: '{"order_id": 12, "number": 147}' });
    expect(e.message).toBe('Приостановить наряд №147 и начать этот?');
    expect(e.code).toBe('ANOTHER_IN_PROGRESS');
    expect(e).toBeInstanceOf(Error);
    expect(parseAnotherInProgress({ order_id: 1, number: 2 })).toEqual({ order_id: 1, number: 2 });
    expect(parseAnotherInProgress('nope')).toBeNull();
  });

  it('copy has no hyphens or dashes', () => {
    for (const [key, value] of Object.entries(ru)) {
      if (key === 'app.name') continue;
      expect(value, key).not.toMatch(/[-‐‑‒–—―]/);
    }
  });
});
