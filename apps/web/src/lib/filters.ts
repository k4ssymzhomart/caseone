// The shared report filter (CLAUDE.md §14) lives in the URL, so a report can be reloaded, linked and exported as
// seen. FilterBar writes it; pages read it:
//
//   const { preset, period, filters } = useReportFilter();   // period: { from, to } ISO, to exclusive
//   const report = useShiftReport({ ...period, filters });
//
// Query params: period=shift|day|week|month|custom, from=YYYY-MM-DD, to=YYYY-MM-DD (custom, local days, both
// inclusive), area=<id>, equipment=<id>, assignee=<uuid>, brigade=<id>. Unknown or broken values are ignored.
// Without `period` the route's default applies (route handle `filter.defaultPreset`, see router.tsx).
import {
  localDaysPeriod,
  periodFor,
  PERIOD_PRESETS,
  toLocalDateInput,
  type Period,
  type PeriodPreset,
  type ReportFilters,
} from '@rota/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMatches, useSearchParams } from 'react-router';

export type FilterPreset = PeriodPreset | 'custom';
export const FILTER_PRESETS: readonly FilterPreset[] = [...PERIOD_PRESETS, 'custom'];
export type FilterField = 'area' | 'equipment' | 'assignee' | 'brigade';
export const FILTER_FIELDS: readonly FilterField[] = ['area', 'equipment', 'assignee', 'brigade'];

/** What a route declares in its handle to get the FilterBar in the top bar. */
export interface FilterConfig {
  /** Presets offered, in order. Default: all five. */
  presets?: readonly FilterPreset[];
  /** Selects offered. Default: all four. [] shows only the period. */
  fields?: readonly FilterField[];
  /** Preset when the URL has none. Default 'shift'. */
  defaultPreset?: FilterPreset;
}

export interface RouteHandle {
  /** i18n key of the page title (document title). */
  title?: string;
  filter?: FilterConfig;
}

export interface ReportFilterState {
  preset: FilterPreset;
  /** The resolved window, ISO, `to` exclusive. Rolling presets end now (refreshed every minute). */
  period: Period;
  /** The jsonb filter every report RPC takes; only set keys are present. */
  filters: ReportFilters;
  /** Custom days as YYYY-MM-DD (also filled for presets, for the date inputs). */
  fromDay: string;
  toDay: string;
}

export interface ReportFilterPatch {
  preset?: FilterPreset;
  fromDay?: string;
  toDay?: string;
  area_id?: number | null;
  equipment_id?: number | null;
  assignee_id?: string | null;
  brigade_id?: number | null;
}

/** The deepest route's filter config, or null when the page has no report filter. */
export function useRouteFilterConfig(): FilterConfig | null {
  const matches = useMatches();
  for (let i = matches.length - 1; i >= 0; i--) {
    const handle = matches[i]?.handle as RouteHandle | undefined;
    if (handle?.filter) return handle.filter;
  }
  return null;
}

/** A clock that ticks once a minute, so rolling periods move without changing query keys on every render. */
function useMinute(): number {
  const [minute, setMinute] = useState(() => Math.floor(Date.now() / 60_000));
  useEffect(() => {
    const id = window.setInterval(() => setMinute(Math.floor(Date.now() / 60_000)), 15_000);
    return () => window.clearInterval(id);
  }, []);
  return minute;
}

const positiveInt = (v: string | null): number | undefined => {
  if (v == null || !/^\d+$/.test(v)) return undefined;
  const n = Number(v);
  return n > 0 ? n : undefined;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Reads (and, with the returned setter, writes) the report filter of the current URL. */
export function useReportFilter(): ReportFilterState & { set: (patch: ReportFilterPatch) => void; reset: () => void } {
  const [params, setParams] = useSearchParams();
  const config = useRouteFilterConfig();
  const minute = useMinute();

  const state = useMemo<ReportFilterState>(() => {
    const now = new Date(minute * 60_000);
    const raw = params.get('period');
    const allowed = config?.presets ?? FILTER_PRESETS;
    const fallback = config?.defaultPreset ?? 'shift';
    let preset: FilterPreset = raw && (allowed as readonly string[]).includes(raw) ? (raw as FilterPreset) : fallback;

    let period: Period;
    let fromDay: string;
    let toDay: string;
    const custom = preset === 'custom' ? localDaysPeriod(params.get('from') ?? '', params.get('to') ?? '') : null;
    if (custom) {
      period = custom;
      fromDay = params.get('from')!;
      toDay = params.get('to')!;
      if (fromDay > toDay) [fromDay, toDay] = [toDay, fromDay];
    } else {
      if (preset === 'custom') preset = fallback === 'custom' ? 'month' : fallback;
      const p = periodFor(preset as PeriodPreset, now);
      // a rolling window ends at the next minute, so rows created this minute are in
      period = { from: p.from, to: new Date((minute + 1) * 60_000).toISOString() };
      fromDay = toLocalDateInput(p.from);
      toDay = toLocalDateInput(now);
    }

    const filters: ReportFilters = {};
    const area = positiveInt(params.get('area'));
    const equipment = positiveInt(params.get('equipment'));
    const brigade = positiveInt(params.get('brigade'));
    const assignee = params.get('assignee');
    if (area != null) filters.area_id = area;
    if (equipment != null) filters.equipment_id = equipment;
    if (brigade != null) filters.brigade_id = brigade;
    if (assignee && UUID.test(assignee)) filters.assignee_id = assignee;
    return { preset, period, filters, fromDay, toDay };
  }, [params, config, minute]);

  const set = useCallback(
    (patch: ReportFilterPatch) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (patch.preset) {
            next.set('period', patch.preset);
            if (patch.preset === 'custom') {
              next.set('from', patch.fromDay ?? state.fromDay);
              next.set('to', patch.toDay ?? state.toDay);
            } else {
              next.delete('from');
              next.delete('to');
            }
          } else {
            if (patch.fromDay !== undefined) next.set('from', patch.fromDay);
            if (patch.toDay !== undefined) next.set('to', patch.toDay);
          }
          const put = (key: string, value: string | number | null | undefined) => {
            if (value === undefined) return;
            if (value === null || value === '') next.delete(key);
            else next.set(key, String(value));
          };
          put('area', patch.area_id);
          put('equipment', patch.equipment_id);
          put('assignee', patch.assignee_id);
          put('brigade', patch.brigade_id);
          return next;
        },
        { replace: true },
      );
    },
    [setParams, state.fromDay, state.toDay],
  );

  const reset = useCallback(() => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const key of ['period', 'from', 'to', 'area', 'equipment', 'assignee', 'brigade']) next.delete(key);
        return next;
      },
      { replace: true },
    );
  }, [setParams]);

  return { ...state, set, reset };
}
