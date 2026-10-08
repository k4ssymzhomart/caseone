// Strings of /equipment/:id (prefix equipment.). They can move into lib/strings.ts when the lanes merge.
import { fill, type I18nParams } from '@rota/shared';
import { t as appT, type Key } from '@/lib/i18n';

export const equipmentRu = {
  'equipment.eyebrow': '{area} · {type} · критичность {criticality}',
  'equipment.inventory': 'Инвентарный {no}',
  'equipment.stopped': 'В простое',
  'equipment.running': 'Работает',
  'equipment.not_found_title': 'Оборудование не найдено',
  'equipment.not_found_text': 'Такой единицы оборудования нет в справочнике.',
  'equipment.to_board': 'К доске нарядов',

  'equipment.kpi.orders': 'Нарядов',
  'equipment.kpi.orders_hint': 'За всю историю',
  'equipment.kpi.unplanned': 'Внеплановых',
  'equipment.kpi.unplanned_hint': 'За 30 дней: {n}',
  'equipment.kpi.downtime': 'Простой всего',
  'equipment.kpi.downtime_hint': 'По нарядам с остановкой',
  'equipment.kpi.downtime_hint_exact': '{duration} по нарядам с остановкой',
  'equipment.hours': '{h} ч',
  'equipment.kpi.active': 'Открытых нарядов',
  'equipment.kpi.active_hint': 'Сейчас',
  'equipment.kpi.repeats': 'Повторных отказов',
  'equipment.kpi.repeats_hint': 'В течение 7 дней после ремонта',
  'equipment.kpi.score': 'Средняя оценка',
  'equipment.kpi.score_hint': 'По закрытым нарядам',
  'equipment.kpi.none': 'нет данных',

  'equipment.chart.title': 'Наряды по неделям',
  'equipment.chart.subtitle': 'Последние {n} недель, неделя с понедельника',
  'equipment.chart.unplanned': 'Внеплановые',
  'equipment.chart.planned': 'Плановые',
  'equipment.chart.total': 'Всего',
  'equipment.chart.week': 'Неделя с {day}',

  'equipment.codes': 'Частые неисправности',
  'equipment.codes.code': 'Шифр',
  'equipment.codes.name': 'Неисправность',
  'equipment.codes.count': 'Нарядов',
  'equipment.codes.share': 'Доля',
  'equipment.codes.last': 'Последний',

  'equipment.history': 'История нарядов',
  'equipment.filter': 'Какие наряды показать',
  'equipment.filter.all': 'Все',
  'equipment.filter.unplanned': 'Внеплановые',
  'equipment.filter.planned': 'Плановые',
  'equipment.filter.active': 'Открытые',
  'equipment.col.number': '№',
  'equipment.col.created': 'Выдан',
  'equipment.col.kind': 'Тип',
  'equipment.col.description': 'Описание',
  'equipment.col.code': 'Шифр',
  'equipment.col.assignee': 'Исполнитель',
  'equipment.col.status': 'Статус',
  'equipment.col.score': 'Оценка',
  'equipment.col.downtime': 'Простой',
  'equipment.repeat': 'Повтор',
  'equipment.more': 'Показать ещё {n}',
  'equipment.empty_title': 'Нарядов по этому оборудованию нет',
  'equipment.empty_text': 'История появится после первого наряда.',
  'equipment.empty_filtered': 'По этому отбору нарядов нет.',
} as const satisfies Record<string, string>;

export type EquipmentKey = keyof typeof equipmentRu;

export function t(key: EquipmentKey | Key, params?: I18nParams): string {
  const own = (equipmentRu as Record<string, string>)[key];
  return own !== undefined ? fill(own, params) : appT(key as Key, params);
}
