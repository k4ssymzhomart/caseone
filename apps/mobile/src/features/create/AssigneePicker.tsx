// Assignee picker (CLAUDE.md §10): a bottom sheet with «Исполнители» and «Бригады». Workers: the AI
// suggestions on top with the «ИИ» tag, then everyone on shift, then everyone off shift («Не на смене»).
// Brigades: free and busy counts; choosing one passes brigade_id and the leader's name (the server assigns
// the leader). Selecting a row calls onSelect, then onClose.
import {
  WORKER_STATE_LABEL,
  workerStateText,
  type AssigneeSuggestion,
  type BrigadeStatusView,
  type WorkerState,
  type WorkerStatusView,
} from '@rota/shared';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { useApi } from '@/lib/api';
import { useDirectories } from '@/lib/directories';
import { t } from '@/lib/i18n';
import { qk } from '@/lib/keys';
import { useTheme } from '@/lib/theme';
import { Avatar, initialsFrom } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { Pill } from '@/ui/Pill';
import { PressableScale } from '@/ui/PressableScale';
import { Segmented } from '@/ui/Segmented';
import { T } from '@/ui/T';
import { Tag } from '@/ui/Tag';

import { BottomSheet } from './BottomSheet';

export interface AssigneeSelection {
  /** The worker; null for a brigade order (the server assigns the brigade leader). */
  assignee_id: string | null;
  brigade_id: number | null;
  /** The worker's short name, or the brigade leader's for a brigade. */
  short_name: string;
}

export interface AssigneePickerProps {
  visible: boolean;
  /** Unit of the order: the AI suggestions need it; null shows the plain lists. */
  equipmentId: number | null;
  /** Required specialty for the suggestions (CLAUDE.md §10), as the create screen derives it. */
  specialty?: string | null;
  onSelect: (sel: AssigneeSelection) => void;
  onClose: () => void;
  /** Optional: marks the current choice with ✓. */
  selected?: { assignee_id: string | null; brigade_id: number | null } | null;
  /** Optional: hides this worker everywhere (reassign: the current assignee). */
  excludeId?: string | null;
  /** Optional: sheet title, «Исполнитель» by default. */
  title?: string;
  /** Optional: called on every tap inside the sheet (the create screen's demo tap counter). */
  onTap?: () => void;
}

type Tab = 'workers' | 'brigades';

const STATE_ORDER: Readonly<Record<WorkerState, number>> = { free: 0, queue: 1, working: 2, off: 3 };
/** Fixed sheet height, so switching tabs does not make it jump. */
const SHEET_SHARE = 0.82;

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export function AssigneePicker({
  visible,
  equipmentId,
  specialty,
  onSelect,
  onClose,
  selected,
  excludeId,
  title,
  onTap,
}: AssigneePickerProps) {
  const api = useApi();
  const theme = useTheme();
  const [tab, setTab] = useState<Tab>(selected?.brigade_id != null ? 'brigades' : 'workers');
  const dirs = useDirectories();

  const workersQ = useQuery({ queryKey: qk.workers, queryFn: () => api.workers.statuses(), enabled: visible });
  const brigadesQ = useQuery({ queryKey: qk.brigades, queryFn: () => api.workers.brigades(), enabled: visible });
  const suggestQ = useQuery({
    queryKey: qk.suggest(equipmentId ?? 0, specialty ?? null),
    queryFn: () => api.orders.suggestAssignees(equipmentId as number, specialty ?? undefined),
    enabled: visible && equipmentId != null,
  });

  const brigadeName = useMemo(() => {
    const m = new Map<number, string>();
    for (const b of dirs.data?.brigades ?? []) m.set(b.id, b.name);
    return m;
  }, [dirs.data]);

  const suggestions: AssigneeSuggestion[] = useMemo(
    () => (equipmentId != null ? (suggestQ.data ?? []) : []).filter((s) => s.employee_id !== excludeId),
    [equipmentId, suggestQ.data, excludeId],
  );

  const { onShift, offShift } = useMemo(() => {
    const suggested = new Set(suggestions.map((s) => s.employee_id));
    const rows = (workersQ.data ?? [])
      .filter((w) => w.id !== excludeId && !suggested.has(w.id))
      .sort(
        (a, b) =>
          STATE_ORDER[a.status] - STATE_ORDER[b.status] || a.short_name.localeCompare(b.short_name),
      );
    return { onShift: rows.filter((w) => w.on_shift), offShift: rows.filter((w) => !w.on_shift) };
  }, [workersQ.data, suggestions, excludeId]);

  const statusById = useMemo(() => {
    const m = new Map<string, WorkerStatusView>();
    for (const w of workersQ.data ?? []) m.set(w.id, w);
    return m;
  }, [workersQ.data]);

  const pick = (sel: AssigneeSelection) => {
    onTap?.();
    onSelect(sel);
    onClose();
  };

  const workerSubtitle = (w: Pick<WorkerStatusView, 'specialty' | 'grade' | 'brigade_id'>): string => {
    const parts: string[] = [];
    if (w.specialty) {
      parts.push(
        w.grade != null
          ? t('create.picker.grade', { specialty: capitalize(w.specialty), grade: w.grade })
          : capitalize(w.specialty),
      );
    }
    const bn = w.brigade_id != null ? brigadeName.get(w.brigade_id) : undefined;
    if (bn) parts.push(bn);
    return parts.join(' · ');
  };

  const onShiftCount = (workersQ.data ?? []).filter((w) => w.on_shift && w.id !== excludeId).length;

  const workerRow = (w: WorkerStatusView) => (
    <PersonRow
      key={w.id}
      name={w.short_name}
      subtitle={workerSubtitle(w)}
      status={w.status}
      stateText={workerStateText(w)}
      selected={selected?.brigade_id == null && selected?.assignee_id === w.id}
      onPress={() => pick({ assignee_id: w.id, brigade_id: null, short_name: w.short_name })}
    />
  );

  const suggestionRow = (s: AssigneeSuggestion) => {
    const w = statusById.get(s.employee_id);
    return (
      <PersonRow
        key={s.employee_id}
        name={s.short_name}
        subtitle={s.reasons.join(' · ')}
        status={s.status}
        stateText={w ? workerStateText(w) : WORKER_STATE_LABEL[s.status]}
        ai
        selected={selected?.brigade_id == null && selected?.assignee_id === s.employee_id}
        onPress={() => pick({ assignee_id: s.employee_id, brigade_id: null, short_name: s.short_name })}
      />
    );
  };

  const brigadeRow = (b: BrigadeStatusView) => {
    const leader = b.leader_short_name;
    return (
      <PressableScale
        key={b.id}
        disabled={!b.leader_id || !leader}
        scaleTo={0.99}
        accessibilityRole="button"
        accessibilityState={{ selected: selected?.brigade_id === b.id, disabled: !b.leader_id }}
        onPress={() => {
          if (b.leader_id && leader) pick({ assignee_id: null, brigade_id: b.id, short_name: leader });
        }}
        style={[styles.row, rowSpacing(theme), !b.leader_id ? styles.dim : null]}
      >
        <Avatar initials={`${initialsFrom(b.name)}${b.id}`} backdropColor={theme.color.bgSubtle} />
        <View style={[styles.col, { gap: theme.space[1] }]}>
          <T variant="body" weight="semibold" numberOfLines={1}>
            {b.name}
          </T>
          <T variant="callout" tone="secondary" numberOfLines={1}>
            {leader ? t('create.picker.leader', { name: leader }) : t('create.picker.noLeader')}
          </T>
          <View style={[styles.pills, { gap: theme.space[2] }]}>
            {b.on_shift_count === 0 ? (
              <Pill label={t('create.picker.noneOnShift')} tone="off" />
            ) : (
              <>
                <Pill label={t('create.picker.free', { n: b.free_count })} tone="free" />
                <Pill label={t('create.picker.busy', { n: b.busy_count })} tone="working" />
              </>
            )}
          </View>
        </View>
        {selected?.brigade_id === b.id ? <Check /> : null}
      </PressableScale>
    );
  };

  const workersBody = (() => {
    if (workersQ.isPending && suggestQ.isPending && suggestions.length === 0) return <Loading />;
    if (workersQ.isError && suggestions.length === 0) {
      return <LoadError onRetry={() => void workersQ.refetch()} />;
    }
    if (suggestions.length === 0 && onShift.length === 0 && offShift.length === 0) {
      return workersQ.isPending ? <Loading /> : <EmptyState mascot="peek" mascotSize={96} title={t('create.picker.empty')} />;
    }
    return (
      <>
        {suggestions.length > 0 ? (
          <Section title={t('create.picker.suggested')}>{suggestions.map(suggestionRow)}</Section>
        ) : null}
        {onShift.length > 0 ? <Section title={t('create.picker.onShift')}>{onShift.map(workerRow)}</Section> : null}
        {offShift.length > 0 ? (
          <Section title={t('create.picker.offShift')}>{offShift.map(workerRow)}</Section>
        ) : null}
        {workersQ.isPending ? <Loading /> : null}
      </>
    );
  })();

  const brigadesBody = (() => {
    if (brigadesQ.isPending) return <Loading />;
    if (brigadesQ.isError) return <LoadError onRetry={() => void brigadesQ.refetch()} />;
    const rows = brigadesQ.data ?? [];
    if (rows.length === 0) return <EmptyState mascot="peek" mascotSize={96} title={t('create.picker.empty')} />;
    return <Section>{rows.map(brigadeRow)}</Section>;
  })();

  return (
    <BottomSheet
      visible={visible}
      title={title ?? t('create.picker.title')}
      onClose={onClose}
      heightShare={SHEET_SHARE}
    >
      <View style={{ paddingHorizontal: theme.size.gutter, paddingBottom: theme.space[3] }}>
        <Segmented<Tab>
          items={[
            { key: 'workers', label: t('create.picker.workers'), count: workersQ.data ? onShiftCount : undefined },
            { key: 'brigades', label: t('create.picker.brigades'), count: brigadesQ.data?.length },
          ]}
          value={tab}
          onChange={(k) => {
            onTap?.();
            setTab(k);
          }}
        />
      </View>
      <ScrollView
        style={styles.fill}
        contentContainerStyle={{
          paddingHorizontal: theme.size.gutter,
          paddingBottom: theme.space[6],
          gap: theme.space[6],
        }}
        keyboardShouldPersistTaps="handled"
      >
        {tab === 'workers' ? workersBody : brigadesBody}
      </ScrollView>
    </BottomSheet>
  );
}

function rowSpacing(theme: ReturnType<typeof useTheme>) {
  return {
    minHeight: theme.size.rowWorker,
    paddingHorizontal: theme.space[4],
    paddingVertical: theme.space[3],
    gap: theme.space[3],
  };
}

function PersonRow({
  name,
  subtitle,
  status,
  stateText,
  ai = false,
  selected,
  onPress,
}: {
  name: string;
  subtitle: string;
  status: WorkerState;
  stateText: string;
  ai?: boolean;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <PressableScale
      scaleTo={0.99}
      accessibilityRole="button"
      accessibilityLabel={[name, ai ? t('common.ai') : '', stateText, subtitle].filter(Boolean).join(', ')}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.row, rowSpacing(theme)]}
    >
      <Avatar name={name} status={status} backdropColor={theme.color.bgSubtle} />
      <View style={[styles.col, { gap: theme.space[1] }]}>
        <View style={[styles.line, { gap: theme.space[2] }]}>
          <T variant="body" weight="semibold" numberOfLines={1} style={styles.shrink}>
            {name}
          </T>
          {ai ? <Tag label={t('common.ai')} tone="accent" /> : null}
        </View>
        {subtitle ? (
          <T variant="callout" tone="secondary" numberOfLines={2}>
            {subtitle}
          </T>
        ) : null}
        <Pill label={stateText} tone={status} />
      </View>
      {selected ? <Check /> : null}
    </PressableScale>
  );
}

function Check() {
  return (
    <T variant="title2" tone="accent" accessibilityLabel={t('create.picker.selected')}>
      ✓
    </T>
  );
}

function Section({ title, children }: { title?: string; children: ReactNode }) {
  const theme = useTheme();
  const rows = Array.isArray(children) ? children : [children];
  return (
    <View style={{ gap: theme.space[2] }}>
      {title ? (
        <T variant="monoCaps" tone="secondary" accessibilityRole="header" style={{ paddingHorizontal: theme.space[4] }}>
          {title}
        </T>
      ) : null}
      <View
        style={{
          backgroundColor: theme.color.bgSubtle,
          borderRadius: theme.radius.md,
          overflow: 'hidden',
          borderWidth: theme.mode === 'light' ? StyleSheet.hairlineWidth : 0,
          borderColor: theme.color.borderDefault,
        }}
      >
        {rows.map((row, i) => (
          <View key={i}>
            {i > 0 ? (
              <View
                style={{
                  height: StyleSheet.hairlineWidth,
                  marginLeft: theme.space[4],
                  backgroundColor: theme.color.borderDefault,
                }}
              />
            ) : null}
            {row}
          </View>
        ))}
      </View>
    </View>
  );
}

function Loading() {
  const theme = useTheme();
  return (
    <View style={{ paddingVertical: theme.space[8], alignItems: 'center' }}>
      <ActivityIndicator color={theme.color.textSecondary} />
    </View>
  );
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <EmptyState
      mascot="oops"
      mascotSize={96}
      title={t('create.picker.error')}
      action={<Button label={t('common.retry')} variant="secondary" onPress={onRetry} />}
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  col: { flex: 1, minWidth: 0 },
  line: { flexDirection: 'row', alignItems: 'center' },
  pills: { flexDirection: 'row', flexWrap: 'wrap' },
  shrink: { flexShrink: 1 },
  dim: { opacity: 0.4 },
});
