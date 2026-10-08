// The shared report filter bar (CLAUDE.md §14): period presets смена, сутки, неделя, месяц, произвольный период,
// plus участок, оборудование, исполнитель, бригада. It reads and writes the URL (lib/filters.ts), so every page reads
// the same state with useReportFilter(). The top bar renders it for routes whose handle has `filter`; a page may
// also place it inline: <FilterBar presets={['shift', 'week', 'month']} fields={[]} />.
import { useMemo } from 'react';
import { Field, Input, Segmented, Select } from '@/components/ui';
import {
  FILTER_FIELDS,
  FILTER_PRESETS,
  useReportFilter,
  useRouteFilterConfig,
  type FilterField,
  type FilterPreset,
} from '@/lib/filters';
import { t } from '@/lib/i18n';
import { useDirectories } from '@/lib/queries';
import { Button } from '../rota';
import styles from './FilterBar.module.css';

export interface FilterBarProps {
  /** Presets to offer; default: the route's handle, else all five. */
  presets?: readonly FilterPreset[];
  /** Selects to offer; default: the route's handle, else all four. */
  fields?: readonly FilterField[];
  className?: string;
}

export function FilterBar({ presets, fields, className }: FilterBarProps) {
  const config = useRouteFilterConfig();
  const shownPresets = presets ?? config?.presets ?? FILTER_PRESETS;
  const shownFields = fields ?? config?.fields ?? FILTER_FIELDS;
  const f = useReportFilter();
  const dirs = useDirectories();
  const d = dirs.data;

  const areaOptions = useMemo(
    () => (d?.areas ?? []).slice().sort((a, b) => a.sort - b.sort).map((a) => ({ value: String(a.id), label: a.name })),
    [d],
  );
  const equipmentOptions = useMemo(
    () =>
      (d?.equipment ?? [])
        .filter((e) => f.filters.area_id == null || e.area_id === f.filters.area_id)
        .map((e) => ({ value: String(e.id), label: e.name })),
    [d, f.filters.area_id],
  );
  const brigadeOptions = useMemo(
    () => (d?.brigades ?? []).map((b) => ({ value: String(b.id), label: b.name })),
    [d],
  );
  const assigneeOptions = useMemo(
    () =>
      (d?.employees ?? [])
        .filter((e) => e.role === 'worker')
        .filter((e) => f.filters.brigade_id == null || e.brigade_id === f.filters.brigade_id)
        .sort((a, b) => a.short_name.localeCompare(b.short_name, 'ru'))
        .map((e) => ({ value: e.id, label: e.short_name })),
    [d, f.filters.brigade_id],
  );

  const hasSelection = Object.keys(f.filters).length > 0;
  const loading = dirs.isPending;

  return (
    <div className={[styles.bar, className].filter(Boolean).join(' ')} role="group" aria-label={t('filter.label')}>
      <Segmented
        label={t('filter.period')}
        value={f.preset}
        options={shownPresets.map((p) => ({ value: p, label: t(`filter.preset.${p}`) }))}
        onChange={(preset) => f.set({ preset })}
      />
      {f.preset === 'custom' ? (
        <div className={styles.days}>
          <Field label={t('filter.from')} hideLabel>
            {(id) => (
              <Input
                id={id}
                type="date"
                value={f.fromDay}
                max={f.toDay}
                onChange={(e) => e.target.value && f.set({ fromDay: e.target.value })}
              />
            )}
          </Field>
          <span className={styles.dash} aria-hidden="true">
            →
          </span>
          <Field label={t('filter.to')} hideLabel>
            {(id) => (
              <Input
                id={id}
                type="date"
                value={f.toDay}
                min={f.fromDay}
                onChange={(e) => e.target.value && f.set({ toDay: e.target.value })}
              />
            )}
          </Field>
        </div>
      ) : null}
      {shownFields.length > 0 ? <span className={styles.divider} aria-hidden="true" /> : null}
      {shownFields.includes('area') ? (
        <Field label={t('filter.area')} hideLabel>
          {(id) => (
            <Select
              id={id}
              className={styles.select}
              disabled={loading}
              placeholder={t('filter.all_areas')}
              options={areaOptions}
              value={f.filters.area_id != null ? String(f.filters.area_id) : ''}
              onChange={(e) => {
                const area = e.target.value ? Number(e.target.value) : null;
                const keepUnit =
                  area == null || d?.equipment.find((x) => x.id === f.filters.equipment_id)?.area_id === area;
                f.set({ area_id: area, ...(keepUnit ? {} : { equipment_id: null }) });
              }}
            />
          )}
        </Field>
      ) : null}
      {shownFields.includes('equipment') ? (
        <Field label={t('filter.equipment')} hideLabel>
          {(id) => (
            <Select
              id={id}
              className={styles.select}
              disabled={loading}
              placeholder={t('filter.all_equipment')}
              options={equipmentOptions}
              value={f.filters.equipment_id != null ? String(f.filters.equipment_id) : ''}
              onChange={(e) => f.set({ equipment_id: e.target.value ? Number(e.target.value) : null })}
            />
          )}
        </Field>
      ) : null}
      {shownFields.includes('brigade') ? (
        <Field label={t('filter.brigade')} hideLabel>
          {(id) => (
            <Select
              id={id}
              className={styles.select}
              disabled={loading}
              placeholder={t('filter.all_brigades')}
              options={brigadeOptions}
              value={f.filters.brigade_id != null ? String(f.filters.brigade_id) : ''}
              onChange={(e) => {
                const brigade = e.target.value ? Number(e.target.value) : null;
                const keepWorker =
                  brigade == null ||
                  d?.employees.find((x) => x.id === f.filters.assignee_id)?.brigade_id === brigade;
                f.set({ brigade_id: brigade, ...(keepWorker ? {} : { assignee_id: null }) });
              }}
            />
          )}
        </Field>
      ) : null}
      {shownFields.includes('assignee') ? (
        <Field label={t('filter.assignee')} hideLabel>
          {(id) => (
            <Select
              id={id}
              className={styles.select}
              disabled={loading}
              placeholder={t('filter.all_assignees')}
              options={assigneeOptions}
              value={f.filters.assignee_id ?? ''}
              onChange={(e) => f.set({ assignee_id: e.target.value || null })}
            />
          )}
        </Field>
      ) : null}
      {hasSelection ? (
        <Button variant="quiet" onClick={() => f.set({ area_id: null, equipment_id: null, assignee_id: null, brigade_id: null })}>
          {t('filter.reset')}
        </Button>
      ) : null}
    </div>
  );
}
