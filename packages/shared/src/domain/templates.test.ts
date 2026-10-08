import { describe, expect, it } from 'vitest';
import { areas, employees, equipment } from '../fixtures';
import { NOTIFICATION_KINDS, type Priority, type Status } from './enums';
import {
  DEDUPE_KEY,
  elapsedMinutes,
  escalationReason,
  isOrderNotificationKind,
  NOTIFICATION_SEVERITY,
  notificationCategory,
  notificationChannel,
  notificationSound,
  notificationTitle,
  notificationUrl,
  overdueMinutes,
  overdueRepeatIndex,
  rejectedReasonLabel,
  reminderMinutes,
  renderNotification,
  renderOrderNotification,
  renderWeeklyDigest,
  reworkTopReason,
  type TemplateOrder,
} from './templates';
import { RotaError } from '../api/errors';

/** The order as internal.notify sees it: the row plus the joined equipment, area and assignee names. */
function order(
  equipmentId: number,
  tabNo: string,
  extra: Partial<TemplateOrder> & { status?: Status; priority?: Priority } = {},
): TemplateOrder {
  const eq = equipment.find((e) => e.id === equipmentId);
  const area = areas.find((a) => a.id === eq?.area_id);
  const who = employees.find((e) => e.tab_no === tabNo);
  return {
    id: 42,
    number: 148,
    priority: 'normal',
    status: 'issued',
    due_at: '2026-10-08T06:30:00Z', // 11:30 local
    last_comment: null,
    equipment_name: eq?.name ?? null,
    area_name: area?.name ?? null,
    assignee_short_name: who?.short_name ?? null,
    ...extra,
  };
}

/** SQL LIKE as a regex (% any run, _ one character). */
function like(pattern: string): RegExp {
  const body = pattern
    .split('')
    .map((c) => (c === '%' ? '.*' : c === '_' ? '.' : c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('');
  return new RegExp(`^${body}$`, 's');
}

const pump = order(20, '2001', { priority: 'emergency' }); // Насос НШ-32 маслостанции, Участок обогащения
const fan = order(17, '2003'); // Вентилятор ВДН-12,5, Участок обогащения

describe('templates: strings pinned by supabase/tests/transitions.sql', () => {
  it('emergency', () => {
    const n = renderOrderNotification('emergency', pump);
    expect(n.body).toBe('АВАРИЙНЫЙ наряд №148. Насос НШ-32 маслостанции, Участок обогащения. Требует ответа.');
    expect(n.url).toBe('/emergency/42');
    expect(n.severity).toBe('critical');
    expect(n.title).toBe('Аварийный наряд №148');
  });

  it('review_ready with a score', () => {
    const n = renderOrderNotification('review_ready', pump, { verdict_label: 'Принято', score: 88 });
    expect(n.body).toBe('Наряд №148 проверен ИИ: Принято, 88 баллов. Подтвердите закрытие.');
    expect(n.url).toBe('/order/42/review');
  });

  it('review_ready when the AI is unsure', () => {
    const n = renderOrderNotification('review_ready', pump, {
      verdict_label: 'Принято с замечаниями',
      score: 72,
      unsure: true,
    });
    expect(n.body).toMatch(like('%ждёт вашей проверки: ИИ не уверен%'));
    expect(n.body).toBe('Наряд №148 ждёт вашей проверки: ИИ не уверен в оценке.');
    expect(n.url).toBe('/order/42/review');
  });

  it('rework from the first failed check', () => {
    const top = reworkTopReason([
      { status: 'pass', message_ru: 'всё на месте' },
      { status: 'fail', message_ru: 'нет фото после: обязательно для внеплановых работ' },
      { status: 'fail', message_ru: 'перерасход: подшипник 22320 6 шт при норме до 2' },
    ]);
    const n = renderOrderNotification('rework', pump, { top_reason: top });
    expect(n.body).toBe(
      'Наряд №148 возвращён на доработку. Причина: нет фото после: обязательно для внеплановых работ.',
    );
    expect(reworkTopReason([])).toBe('низкая оценка ИИ');
  });

  it('rejected', () => {
    const n = renderOrderNotification('rejected', fan, { reason_label: rejectedReasonLabel('no_permit') });
    expect(n.body).toMatch(like('%отклонён%Причина: Нет допуска.'));
    expect(n.body).toBe(
      'Наряд №148 отклонён. Вентилятор ВДН-12,5, Участок обогащения. Исполнитель: Нурпеисов А. Причина: Нет допуска.',
    );
  });

  it('reminder', () => {
    const n = renderOrderNotification('reminder', fan, { minutes: 1 });
    expect(n.body).toBe('Через 1 мин истекает срок наряда №148. Вентилятор ВДН-12,5, Участок обогащения.');
  });

  it('overdue in the case format', () => {
    const n = renderOrderNotification('overdue', fan, { minutes: 1, status_since: '10:41' });
    expect(n.body).toMatch(
      like(
        'Наряд №% просрочен на 1 мин. Вентилятор ВДН-12,5, Участок обогащения. Исполнитель: Нурпеисов А. Статус: Выдан с %.',
      ),
    );
    expect(n.body).toBe(
      'Наряд №148 просрочен на 1 мин. Вентилятор ВДН-12,5, Участок обогащения. Исполнитель: Нурпеисов А. Статус: Выдан с 10:41.',
    );
  });

  it('escalation with a one tap reassign target', () => {
    const n = renderOrderNotification('escalation', fan, {
      minutes: 12,
      cand_short_name: 'Ким Д.',
      cand_reason: escalationReason(['Свободен', 'Электромонтёр 5 разряда']),
      cand_id: 'abc',
    });
    expect(n.body).toMatch(like('Наряд №% не принят за 12 мин.%Предлагаем: %'));
    expect(n.body).toBe(
      'Наряд №148 не принят за 12 мин. Вентилятор ВДН-12,5, Участок обогащения. Исполнитель: Нурпеисов А. Предлагаем: Ким Д., свободен.',
    );
    expect(n.url).toMatch(like('/order/%?reassign=%'));
    expect(n.url).toBe('/order/42?reassign=abc');
    expect(n.severity).toBe('warning');
  });
});

describe('templates: every kind', () => {
  it('new_order', () => {
    const n = renderOrderNotification('new_order', order(13, '2002', { priority: 'high' }));
    expect(n.body).toBe('Новый наряд №148. Конвейер К-3, Участок дробления. Срок до 11:30. Приоритет: высокий.');
    expect(n.title).toBe('Новый наряд №148');
    expect(n.url).toBe('/order/42');
    expect(n.severity).toBe('info');
  });

  it('overdue with the last comment, and a status time given as a timestamp', () => {
    const o = order(13, '2002', { status: 'paused', last_comment: 'ждём подшипник со склада' });
    const n = renderOrderNotification('overdue', o, { minutes: 12, status_since: '2026-10-08T05:05:00Z' });
    expect(n.body).toBe(
      'Наряд №148 просрочен на 12 мин. Конвейер К-3, Участок дробления. Исполнитель: Иванов С. ' +
        'Статус: Приостановлен с 10:05. Последний комментарий: “ждём подшипник со склада”.',
    );
    expect(n.title).toBe('Просрочен №148');
    expect(n.severity).toBe('critical');
    // a blank comment leaves the clause out, like nullif(btrim(...), '')
    expect(renderOrderNotification('overdue', { ...o, last_comment: '   ' }, { minutes: 12, status_since: '10:05' }).body).toBe(
      'Наряд №148 просрочен на 12 мин. Конвейер К-3, Участок дробления. Исполнитель: Иванов С. Статус: Приостановлен с 10:05.',
    );
  });

  it('escalation without a candidate leaves the suggestion out', () => {
    const n = renderOrderNotification('escalation', fan, { minutes: 10, cand_short_name: null });
    expect(n.body).toBe(
      'Наряд №148 не принят за 10 мин. Вентилятор ВДН-12,5, Участок обогащения. Исполнитель: Нурпеисов А.',
    );
    expect(n.url).toBe('/order/42');
    // a candidate without a reason is «свободен»
    expect(renderOrderNotification('escalation', fan, { minutes: 10, cand_short_name: 'Ким Д.' }).body).toMatch(
      /Предлагаем: Ким Д\., свободен\.$/,
    );
  });

  it('manager_overdue', () => {
    const n = renderOrderNotification('manager_overdue', fan, { minutes: 75 });
    expect(n.body).toBe(
      'Длительная просрочка: наряд №148 просрочен на 75 мин. Вентилятор ВДН-12,5, Участок обогащения. Исполнитель: Нурпеисов А.',
    );
    expect(n.title).toBe('Длительная просрочка №148');
    expect(n.severity).toBe('critical');
  });

  it('rework from the master: trailing periods trimmed, default reason', () => {
    expect(renderOrderNotification('rework', pump, { top_reason: 'Нет фото после замены.' }).body).toBe(
      'Наряд №148 возвращён на доработку. Причина: Нет фото после замены.',
    );
    expect(renderOrderNotification('rework', pump).body).toBe(
      'Наряд №148 возвращён на доработку. Причина: см. отчёт.',
    );
    expect(renderOrderNotification('rework', pump).url).toBe('/order/42');
  });

  it('review_rework', () => {
    const n = renderOrderNotification('review_rework', order(12, '2002'), {
      top_reason: 'перерасход: подшипник 22320 6 шт при норме до 2',
    });
    expect(n.body).toBe(
      'ИИ вернул наряд №148 на доработку. Причина: перерасход: подшипник 22320 6 шт при норме до 2. Исполнитель: Иванов С.',
    );
    expect(n.title).toBe('ИИ вернул №148');
    expect(n.url).toBe('/order/42/review');
    expect(n.severity).toBe('critical');
  });

  it('report, with Russian agreement of баллов', () => {
    const r = (score: number) => renderOrderNotification('report', pump, { verdict: 'accepted', score }).body;
    expect(r(81)).toBe('Наряд №148 проверен ИИ: Принято, 81 балл. Ждёт подтверждения мастера.');
    expect(r(82)).toBe('Наряд №148 проверен ИИ: Принято, 82 балла. Ждёт подтверждения мастера.');
    expect(r(85)).toBe('Наряд №148 проверен ИИ: Принято, 85 баллов. Ждёт подтверждения мастера.');
    expect(r(11)).toBe('Наряд №148 проверен ИИ: Принято, 11 баллов. Ждёт подтверждения мастера.');
    expect(renderOrderNotification('report', pump).url).toBe('/order/42/review');
    // no score: the clause is left out
    expect(renderOrderNotification('report', pump, { verdict_label: 'Принято с замечаниями' }).body).toBe(
      'Наряд №148 проверен ИИ: Принято с замечаниями. Ждёт подтверждения мастера.',
    );
  });

  it('rejected with other: the comment joins the label', () => {
    expect(rejectedReasonLabel('other', '  Нет ключа от щитовой ')).toBe('Другое: нет ключа от щитовой');
    expect(rejectedReasonLabel('other', '')).toBe('Другое');
    expect(rejectedReasonLabel('no_materials', 'Нет ключа')).toBe('Нет материалов');
    const n = renderOrderNotification('rejected', fan, { reason_label: rejectedReasonLabel('other', 'Нет ключа.') });
    expect(n.body).toMatch(/Причина: Другое: нет ключа\.$/);
    expect(n.title).toBe('Отклонён №148');
    expect(n.severity).toBe('warning');
  });

  it('reassigned', () => {
    const n = renderOrderNotification('reassigned', fan);
    expect(n.body).toBe('Наряд №148 передан другому исполнителю. Вентилятор ВДН-12,5, Участок обогащения.');
    expect(n.title).toBe('Передан №148');
    expect(n.severity).toBe('info');
  });

  it('closed', () => {
    const n = renderOrderNotification('closed', pump, { verdict: 'accepted_with_remarks', score: 72 });
    expect(n.body).toBe('Наряд №148 закрыт. Итог: Принято с замечаниями, 72 балла.');
    expect(n.title).toBe('Закрыт №148');
  });

  it('cancelled', () => {
    const n = renderOrderNotification('cancelled', fan, { reason: 'Ошибочно выдан.' });
    expect(n.body).toBe('Наряд №148 отменён. Вентилятор ВДН-12,5, Участок обогащения. Причина: Ошибочно выдан.');
    expect(n.title).toBe('Отменён №148');
    expect(n.severity).toBe('warning');
  });

  it('weekly_digest with выводов agreement', () => {
    const d = renderWeeklyDigest({ count: 5, top_title: 'Конвейер К-3: 7 внеплановых остановок за 30 дней' });
    expect(d.body).toBe('Сводка ИИ за неделю: 5 выводов. Главное: Конвейер К-3: 7 внеплановых остановок за 30 дней.');
    expect(d.title).toBe('Сводка ИИ за неделю');
    expect(d.order_id).toBeNull();
    expect(d.severity).toBe('info');
    expect(renderWeeklyDigest({ count: 1, top_title: 'А.' }).body).toBe('Сводка ИИ за неделю: 1 вывод. Главное: А.');
    expect(renderWeeklyDigest({ count: 3 }).body).toBe('Сводка ИИ за неделю: 3 вывода.');
  });

  it('a url in vars overrides the default', () => {
    expect(renderOrderNotification('closed', pump, { url: '/x' }).url).toBe('/x');
    expect(renderOrderNotification('closed', pump, { url: '' }).url).toBe('/order/42');
  });

  it('every kind renders with a title, severity and url', () => {
    for (const kind of NOTIFICATION_KINDS) {
      const n = renderNotification(kind, isOrderNotificationKind(kind) ? pump : null, { minutes: 5, count: 2 });
      expect(n.kind).toBe(kind);
      expect(n.title).toBe(notificationTitle(kind, 148));
      expect(n.severity).toBe(NOTIFICATION_SEVERITY[kind]);
      expect(n.body.length).toBeGreaterThan(10);
      expect(n.body).not.toMatch(/undefined|null|NaN/);
      expect(n.url.startsWith('/')).toBe(true);
    }
    expect(() => renderNotification('closed', null)).toThrow(RotaError);
  });

  it('severity matches CLAUDE.md §8', () => {
    const critical = NOTIFICATION_KINDS.filter((k) => NOTIFICATION_SEVERITY[k] === 'critical');
    const warning = NOTIFICATION_KINDS.filter((k) => NOTIFICATION_SEVERITY[k] === 'warning');
    expect(critical.sort()).toEqual(['emergency', 'manager_overdue', 'overdue', 'review_rework', 'rework']);
    expect(warning.sort()).toEqual(['cancelled', 'escalation', 'rejected', 'reminder']);
  });

  it('urls', () => {
    expect(notificationUrl('emergency', 7)).toBe('/emergency/7');
    expect(notificationUrl('report', 7)).toBe('/order/7/review');
    expect(notificationUrl('escalation', 7, 'u1')).toBe('/order/7?reassign=u1');
    expect(notificationUrl('escalation', 7)).toBe('/order/7');
    expect(notificationUrl('overdue', 7)).toBe('/order/7');
    expect(notificationUrl('weekly_digest', null)).toBe('/analytics');
  });
});

describe('push routing matches notify-dispatch', () => {
  it('channels, sounds and the action category', () => {
    expect(notificationChannel('emergency')).toBe('emergency');
    expect(notificationSound('emergency')).toBe('siren.wav');
    for (const k of ['reminder', 'overdue', 'rework'] as const) {
      expect(notificationChannel(k)).toBe('reminders');
      expect(notificationSound(k)).toBe('default');
    }
    for (const k of ['new_order', 'escalation', 'review_rework', 'report', 'weekly_digest'] as const) {
      expect(notificationChannel(k)).toBe('orders');
      expect(notificationSound(k)).toBe('ding.wav');
    }
    expect(notificationCategory('new_order')).toBe('order_actions');
    expect(notificationCategory('emergency')).toBe('order_actions');
    expect(notificationCategory('overdue')).toBeNull();
  });
});

describe('watchdog vars and keys match the SQL', () => {
  const now = new Date('2026-10-08T10:00:00Z');

  it('minutes', () => {
    expect(reminderMinutes('2026-10-08T10:00:25Z', now)).toBe(1);
    expect(reminderMinutes('2026-10-08T10:24:10Z', now)).toBe(25);
    expect(overdueMinutes('2026-10-08T09:59:50Z', now)).toBe(1);
    expect(overdueMinutes('2026-10-08T09:47:30Z', now)).toBe(12);
    expect(elapsedMinutes('2026-10-08T09:47:30Z', now)).toBe(12);
    expect(elapsedMinutes('2026-10-08T09:59:50Z', now)).toBe(0);
  });

  it('dedupe keys', () => {
    const due = '2026-10-08T10:00:00.700Z';
    expect(DEDUPE_KEY.created(9)).toBe('ev:9:new');
    expect(DEDUPE_KEY.event(9, 'rejected')).toBe('ev:9:rejected');
    expect(DEDUPE_KEY.escalation(5, 'u1')).toBe('esc:5:u1');
    expect(DEDUPE_KEY.escalationReminder(5, 'u1')).toBe('escrem:5:u1');
    expect(DEDUPE_KEY.reminder(5, due)).toBe('rem:5:1791453600');
    expect(DEDUPE_KEY.overdue(5, due, 2)).toBe('ovd:5:1791453600:2');
    expect(DEDUPE_KEY.managerOverdue(5)).toBe('mgr:5');
    expect(overdueRepeatIndex('2026-10-08T09:29:00Z', now, 900)).toBe(2);
    expect(overdueRepeatIndex('2026-10-08T09:59:00Z', now, 900)).toBe(0);
  });
});
