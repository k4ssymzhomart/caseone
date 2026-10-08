// Strings of /shift and the shift counters row (also shown on /board). They follow lib/strings.ts (prefix shift.)
// and can move there when the lanes merge; t() below reads them first, then the panel and domain dictionaries.
import { fill, type I18nParams } from '@rota/shared';
import { t as appT, type Key } from '@/lib/i18n';

export const shiftRu = {
  'shift.eyebrow': '{shift} · {hours}',
  'shift.to_board': 'Доска нарядов',

  'shift.counter.issued': 'Выдано',
  'shift.counter.done': 'Выполнено',
  'shift.counter.overdue': 'Просрочено',
  'shift.counter.stopped': 'Оборудование в простое',
  'shift.counter.since': 'С начала смены в {time}',
  'shift.counter.now': 'Сейчас',
  'shift.counter.error': 'Счётчики смены не загрузились',

  'shift.workers': 'Исполнители',
  'shift.workers_aside': 'На смене {on} из {total}',
  'shift.group': '{label} · {count}',
  'shift.group.free': 'Свободны',
  'shift.group.working': 'Работают',
  'shift.group.queue': 'В очереди',
  'shift.group.off': 'Не на смене',
  'shift.specialty_grade': '{specialty} · {grade} разряд',
  'shift.on_shift': 'На смене',
  'shift.on_shift_label': '{name}: на смене',
  'shift.on_shift_done': '{name}: на смене',
  'shift.off_shift_done': '{name}: не на смене',
  'shift.show_orders': 'Показать наряды: {name}',
  'shift.workers_empty': 'Исполнителей пока нет. Они появятся после загрузки справочников.',

  'shift.orders': 'Наряды в работе',
  'shift.orders_filter': 'Какие наряды показать',
  'shift.orders.all': 'Все',
  'shift.orders.overdue': 'Просрочены',
  'shift.orders.emergency': 'Аварийные',
  'shift.orders.rejected': 'Отклонены',
  'shift.orders_of': 'Наряды: {name}',
  'shift.orders_clear': 'Все исполнители',
  'shift.orders_empty_title': 'Активных нарядов нет',
  'shift.orders_empty_text': 'Новые наряды появятся здесь сразу после выдачи.',
  'shift.orders_none_filtered': 'По этому отбору нарядов нет.',

  'shift.brigades': 'Бригады',
  'shift.brigades_empty': 'Бригад пока нет.',
  'shift.brigade_leader': 'Бригадир {name}',
  'shift.brigade_counts': 'Свободны {free} · Заняты {busy}',
  'shift.brigade_off': 'Не на смене',
  'shift.brigade_on': 'На смене {count}',

  'shift.stopped': 'Оборудование в простое',
  'shift.stopped_none': 'Всё оборудование работает.',
  'shift.stopped_for': 'В простое {duration}',
  'shift.stopped_order': 'Наряд №{number}',
} as const satisfies Record<string, string>;

export type ShiftKey = keyof typeof shiftRu;

export function t(key: ShiftKey | Key, params?: I18nParams): string {
  const own = (shiftRu as Record<string, string>)[key];
  return own !== undefined ? fill(own, params) : appT(key as Key, params);
}
