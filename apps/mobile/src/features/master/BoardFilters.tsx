// Board filter chips (CLAUDE.md §10b): участок, оборудование, исполнитель, приоритет. Each chip opens a small
// sheet with an ActionList of values (directories, or the units and people of the loaded orders); «Все» resets
// that filter. Filtering is client side over orders.forBoard(), so the column counts follow the filters.
import {
  PRIORITIES_SORTED,
  PRIORITY_LABEL,
  type Directories,
  type OrderView,
  type Priority,
} from '@rota/shared';
import { useMemo, useState } from 'react';
import { ScrollView } from 'react-native';

import { t } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { ActionList, type ActionListItem } from '@/ui/ActionList';
import { Chip } from '@/ui/Chip';

import { BottomSheet } from './BottomSheet';

export interface BoardFilterState {
  area_id: number | null;
  equipment_id: number | null;
  assignee_id: string | null;
  priority: Priority | null;
}

export const EMPTY_BOARD_FILTERS: BoardFilterState = {
  area_id: null,
  equipment_id: null,
  assignee_id: null,
  priority: null,
};

export type BoardFilterKey = keyof BoardFilterState;

const FILTER_KEYS: readonly BoardFilterKey[] = ['area_id', 'equipment_id', 'assignee_id', 'priority'];

const FILTER_LABEL: Record<BoardFilterKey, string> = {
  area_id: 'master.board.filter.area',
  equipment_id: 'master.board.filter.equipment',
  assignee_id: 'master.board.filter.assignee',
  priority: 'master.board.filter.priority',
};

const ALL = '__all';

export function hasBoardFilters(f: BoardFilterState): boolean {
  return FILTER_KEYS.some((k) => f[k] !== null);
}

export function applyBoardFilters(orders: readonly OrderView[], f: BoardFilterState): OrderView[] {
  return orders.filter(
    (o) =>
      (f.area_id === null || o.area_id === f.area_id) &&
      (f.equipment_id === null || o.equipment_id === f.equipment_id) &&
      (f.assignee_id === null || o.assignee_id === f.assignee_id) &&
      (f.priority === null || o.priority === f.priority),
  );
}

interface Option {
  key: string;
  label: string;
  sublabel?: string;
}

const byLabel = (a: Option, b: Option) => a.label.localeCompare(b.label);

/** Values of every filter: directories where they exist, plus whatever the loaded orders carry. */
function useOptions(orders: readonly OrderView[], dirs: Directories | undefined, f: BoardFilterState) {
  return useMemo(() => {
    const areas = new Map<number, Option & { sort: number }>();
    for (const a of dirs?.areas ?? []) areas.set(a.id, { key: String(a.id), label: a.name, sort: a.sort });
    const equipment = new Map<number, Option & { area_id: number }>();
    const people = new Map<string, Option>();
    for (const o of orders) {
      if (!areas.has(o.area_id)) areas.set(o.area_id, { key: String(o.area_id), label: o.area_name, sort: 1000 + o.area_id });
      equipment.set(o.equipment_id, {
        key: String(o.equipment_id),
        label: o.equipment_name,
        sublabel: o.area_name,
        area_id: o.area_id,
      });
      people.set(o.assignee_id, { key: o.assignee_id, label: o.assignee_short_name });
    }
    // A selected value stays pickable even when no loaded order carries it any more.
    if (f.equipment_id !== null && !equipment.has(f.equipment_id)) {
      const e = dirs?.equipment.find((x) => x.id === f.equipment_id);
      if (e) {
        equipment.set(e.id, {
          key: String(e.id),
          label: e.name,
          sublabel: areas.get(e.area_id)?.label,
          area_id: e.area_id,
        });
      }
    }
    if (f.assignee_id !== null && !people.has(f.assignee_id)) {
      const e = dirs?.employees.find((x) => x.id === f.assignee_id);
      if (e) people.set(e.id, { key: e.id, label: e.short_name });
    }
    const priorities: Option[] = PRIORITIES_SORTED.map((p) => ({ key: p, label: PRIORITY_LABEL[p] }));
    return {
      area_id: [...areas.values()].sort((a, b) => a.sort - b.sort),
      equipment_id: [...equipment.values()]
        .filter((e) => f.area_id === null || e.area_id === f.area_id)
        .sort(byLabel),
      assignee_id: [...people.values()].sort(byLabel),
      priority: priorities,
      equipmentAreaOf: (id: number) => equipment.get(id)?.area_id ?? null,
    };
  }, [orders, dirs, f.area_id, f.equipment_id, f.assignee_id]);
}

export interface BoardFiltersProps {
  value: BoardFilterState;
  onChange: (next: BoardFilterState) => void;
  /** The loaded board orders (before filtering): units and people come from them. */
  orders: readonly OrderView[];
  directories?: Directories;
}

export function BoardFilters({ value, onChange, orders, directories }: BoardFiltersProps) {
  const theme = useTheme();
  const options = useOptions(orders, directories, value);
  const [open, setOpen] = useState<BoardFilterKey | null>(null);

  const currentKey = (k: BoardFilterKey): string | null => {
    const v = value[k];
    return v === null ? null : String(v);
  };

  const valueLabel = (k: BoardFilterKey): string | null => {
    const key = currentKey(k);
    if (key === null) return null;
    const list: readonly Option[] = options[k];
    return list.find((o) => o.key === key)?.label ?? null;
  };

  const select = (k: BoardFilterKey, key: string) => {
    setOpen(null);
    const all = key === ALL;
    const next: BoardFilterState = { ...value };
    switch (k) {
      case 'area_id':
        next.area_id = all ? null : Number(key);
        // A unit of another area cannot match any more.
        if (
          next.area_id !== null &&
          next.equipment_id !== null &&
          options.equipmentAreaOf(next.equipment_id) !== next.area_id
        ) {
          next.equipment_id = null;
        }
        break;
      case 'equipment_id':
        next.equipment_id = all ? null : Number(key);
        break;
      case 'assignee_id':
        next.assignee_id = all ? null : key;
        break;
      case 'priority':
        next.priority = all ? null : (key as Priority);
        break;
    }
    onChange(next);
  };

  const items: ActionListItem[] = open
    ? [
        { key: ALL, label: t('master.board.filter.all') },
        ...options[open].map((o) => ({
          key: o.key,
          label: o.label,
          ...(o.sublabel ? { sublabel: o.sublabel } : {}),
          ...(open === 'priority' && o.key === 'emergency' ? { tone: 'critical' as const } : {}),
        })),
      ]
    : [];

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityLabel={t('master.board.filters')}
        style={{ flexGrow: 0, marginHorizontal: -theme.size.gutter }}
        contentContainerStyle={{ paddingHorizontal: theme.size.gutter, gap: theme.space[2] }}
      >
        {FILTER_KEYS.map((k) => {
          const label = valueLabel(k);
          const name = t(FILTER_LABEL[k]);
          return (
            <Chip
              key={k}
              label={label ? t('master.board.filter.value', { name, value: label }) : name}
              selected={label !== null}
              onPress={() => setOpen(k)}
              testID={`board-filter-${k}`}
            />
          );
        })}
        {hasBoardFilters(value) ? (
          <Chip label={t('master.board.filter.reset')} onPress={() => onChange(EMPTY_BOARD_FILTERS)} />
        ) : null}
      </ScrollView>
      <BottomSheet
        visible={open !== null}
        onClose={() => setOpen(null)}
        title={open ? t(FILTER_LABEL[open]) : ''}
        gutters={false}
      >
        <ActionList
          items={items}
          value={open ? (currentKey(open) ?? ALL) : null}
          onSelect={(key) => open && select(open, key)}
        />
      </BottomSheet>
    </>
  );
}
