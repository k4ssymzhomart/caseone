// Strings of /board (prefix board.). Column names and badges come from the domain dictionary (board.issued,
// board.badge.*); these are the page's own. They can move into lib/strings.ts when the lanes merge.
import { fill, type I18nParams } from '@rota/shared';
import { t as appT, type Key } from '@/lib/i18n';

export const boardRu = {
  'board.filters': 'Фильтр доски',
  'board.f.area': 'Участок',
  'board.f.priority': 'Приоритет',
  'board.f.equipment': 'Оборудование',
  'board.f.assignee': 'Исполнитель',
  'board.area_all': 'Все участки',
  'board.priority_all': 'Любой приоритет',
  'board.equipment_all': 'Всё оборудование',
  'board.assignee_all': 'Все исполнители',
  'board.reset': 'Сбросить',
  'board.columns': 'Колонки доски',
  'board.column_count': '{column}: {count}',
  'board.column_empty': 'Нет нарядов',
  'board.empty_title': 'На доске пусто',
  'board.empty_text': 'Активных нарядов нет. Новые появятся здесь сразу после выдачи.',
  'board.empty_filtered_title': 'По этому отбору нарядов нет',
  'board.empty_filtered_text': 'Измените фильтр или сбросьте его.',
  'board.shown': 'На доске {count}',
} as const satisfies Record<string, string>;

export type BoardKey = keyof typeof boardRu;

export function t(key: BoardKey | Key, params?: I18nParams): string {
  const own = (boardRu as Record<string, string>)[key];
  return own !== undefined ? fill(own, params) : appT(key as Key, params);
}
