// Create an order (master modal): CLAUDE.md §10b, PHASE_0 §7.1 create, PHASE_2 §2.3.
// Required fields in 5 taps: «Выдать» tab → preset → unit → problem → «Выдать». The draft's client_ref is made
// when the screen opens; «До» photos upload under it at once and create_order links them.
import {
  formatDuration,
  isActive,
  isRotaError,
  type CreateOrderInput,
  type Equipment,
  type ProblemTemplate,
} from '@rota/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, type Href } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AssigneeCard } from '@/features/create/AssigneeCard';
import { AssigneePicker, type AssigneeSelection } from '@/features/create/AssigneePicker';
import { DeadlineSheet } from '@/features/create/DeadlineSheet';
import {
  deadlineInput,
  deadlineText,
  type DeadlineChoice,
  type DeadlineContext,
} from '@/features/create/deadline';
import { DEFAULT_PRESET, PRESETS, presetByKey, type PresetKey } from '@/features/create/presets';
import { rememberEquipment, useRecentEquipment } from '@/features/create/recentEquipment';
import { requiredSpecialty } from '@/features/create/specialty';
import { useBeforePhotos } from '@/features/create/useBeforePhotos';
import { formatTaps, useTapCounter } from '@/features/create/useTapCounter';
import { errorText } from '@/features/orders/useOrderAction';
import { newActionId, useApi } from '@/lib/api';
import { indexDirectories, useDirectories } from '@/lib/directories';
import { onHardwareBack } from '@/lib/hardwareBack';
import { haptic } from '@/lib/haptics';
import { t } from '@/lib/i18n';
import { qk } from '@/lib/keys';
import { isSimulator, PhotoCancelled, PhotoPermissionDenied, takeBeforePhoto } from '@/lib/photo';
import { RoleGate } from '@/lib/roleGate';
import { useTheme } from '@/lib/theme';
import { Banner } from '@/ui/Banner';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { ConfirmProvider, useConfirm } from '@/ui/ConfirmSheet';
import { EmptyState } from '@/ui/EmptyState';
import { Eyebrow } from '@/ui/Eyebrow';
import { useHud } from '@/ui/Hud';
import { ListGroup } from '@/ui/ListGroup';
import { ListRow } from '@/ui/ListRow';
import { PhotoTile } from '@/ui/PhotoTile';
import { Screen } from '@/ui/Screen';
import { Switch } from '@/ui/Switch';
import { T } from '@/ui/T';
import { Tag } from '@/ui/Tag';
import { TapCounter } from '@/ui/TapCounter';
import { TextArea } from '@/ui/TextArea';
import { TextField } from '@/ui/TextField';

/** Units shown before «Ещё N» when no area is picked: recent and busy units come first. */
const COLLAPSED_UNITS = 8;
const MAX_PHOTOS = 5;
/** «Выдать» waits this long for running photo uploads (PHASE_2 §2.4), then issues anyway. */
const PHOTO_WAIT_MS = 15_000;
/** HUD time for the demo result «Выдан за 5 нажатий · 0:38». */
const DEMO_HUD_MS = 5_000;

export default function CreateRoute() {
  // The confirm sheet is a React Native Modal; rendered inside this native modal it shows above it.
  return (
    <RoleGate allow={['master']}>
      <ConfirmProvider>
        <CreateScreen />
      </ConfirmProvider>
    </RoleGate>
  );
}

function useNow(intervalMs: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function closeScreen() {
  if (router.canGoBack()) router.back();
  else router.replace('/' as Href);
}

function CreateScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const api = useApi();
  const qc = useQueryClient();
  const hud = useHud();
  const confirm = useConfirm();

  const dirsQ = useDirectories();
  const settingsQ = useQuery({ queryKey: qk.settings, queryFn: () => api.demo.settings() });
  const demoMode = settingsQ.data?.demo_mode ?? false;
  const counter = useTapCounter(demoMode);
  const tap = counter.tap;
  const now = useNow(demoMode ? 1_000 : 15_000);

  const [initialRef] = useState(() => newActionId());
  const photos = useBeforePhotos(initialRef);
  const recent = useRecentEquipment();
  const boardQ = useQuery({ queryKey: qk.board({}), queryFn: () => api.orders.forBoard({}) });

  const [presetKey, setPresetKey] = useState<PresetKey>(DEFAULT_PRESET);
  const [stopped, setStopped] = useState(presetByKey(DEFAULT_PRESET).equipmentStopped);
  const [areaId, setAreaId] = useState<number | null>(null);
  const [equipmentId, setEquipmentId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  // After a unit is picked the list folds to that one chip, so the problem chips and «Выдать» move up.
  const [unitsOpen, setUnitsOpen] = useState(true);
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [description, setDescription] = useState('');
  const [manual, setManual] = useState<AssigneeSelection | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [deadline, setDeadline] = useState<DeadlineChoice>({ kind: 'auto' });
  const [deadlineOpen, setDeadlineOpen] = useState(false);
  const [commentOpen, setCommentOpen] = useState(false);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoNotice, setPhotoNotice] = useState<string | null>(null);

  const dirs = dirsQ.data;
  const index = useMemo(() => (dirs ? indexDirectories(dirs) : null), [dirs]);
  const preset = presetByKey(presetKey);
  const equipment = equipmentId != null ? (index?.equipment.get(equipmentId) ?? null) : null;
  const template = templateId != null ? (dirs?.problem_templates.find((p) => p.id === templateId) ?? null) : null;
  const suggestedCode = template?.suggested_fault_code ?? null;
  const faultCode = suggestedCode ? (index?.faultCodes.get(suggestedCode) ?? null) : null;
  const codeNorm = suggestedCode
    ? (dirs?.work_norms.find((n) => n.fault_code === suggestedCode)?.norm_hours ?? null)
    : null;
  const typeSpecialty = equipment
    ? (dirs?.equipment_type_specialty.find((s) => s.type === equipment.type)?.specialty ?? null)
    : null;
  const specialty = requiredSpecialty(description, typeSpecialty, faultCode?.specialty ?? null);

  const suggestQ = useQuery({
    queryKey: qk.suggest(equipmentId ?? 0, specialty),
    queryFn: () => api.orders.suggestAssignees(equipmentId as number, specialty ?? undefined),
    enabled: equipmentId != null,
  });
  const suggestions = equipmentId != null ? (suggestQ.data ?? []) : [];
  const top = suggestions[0] ?? null;
  const assignee: AssigneeSelection | null =
    manual ?? (top ? { assignee_id: top.employee_id, brigade_id: null, short_name: top.short_name } : null);
  const manualSuggestion =
    manual && manual.brigade_id == null
      ? (suggestions.find((s) => s.employee_id === manual.assignee_id) ?? null)
      : null;
  const brigadeName =
    manual?.brigade_id != null ? (dirs?.brigades.find((b) => b.id === manual.brigade_id)?.name ?? null) : null;

  const openCounts = useMemo(() => {
    const m = new Map<number, number>();
    for (const o of boardQ.data ?? []) {
      if (isActive(o.status)) m.set(o.equipment_id, (m.get(o.equipment_id) ?? 0) + 1);
    }
    return m;
  }, [boardQ.data]);

  const areas = useMemo(() => [...(dirs?.areas ?? [])].sort((a, b) => a.sort - b.sort), [dirs]);

  // Recent units first, then units with open orders (busiest first), then the rest by area and id.
  const orderedEquipment = useMemo(() => {
    if (!dirs) return [];
    const byId = new Map(dirs.equipment.map((e) => [e.id, e]));
    const areaSort = new Map(dirs.areas.map((a) => [a.id, a.sort]));
    const out: Equipment[] = [];
    const seen = new Set<number>();
    const push = (e: Equipment | undefined) => {
      if (e && !seen.has(e.id)) {
        seen.add(e.id);
        out.push(e);
      }
    };
    for (const id of recent) push(byId.get(id));
    [...dirs.equipment]
      .filter((e) => (openCounts.get(e.id) ?? 0) > 0)
      .sort((a, b) => (openCounts.get(b.id) ?? 0) - (openCounts.get(a.id) ?? 0) || a.id - b.id)
      .forEach(push);
    [...dirs.equipment]
      .sort((a, b) => (areaSort.get(a.area_id) ?? 0) - (areaSort.get(b.area_id) ?? 0) || a.id - b.id)
      .forEach(push);
    return out;
  }, [dirs, recent, openCounts]);

  const filtered = areaId == null ? orderedEquipment : orderedEquipment.filter((e) => e.area_id === areaId);
  const showAll = areaId != null || expanded;
  const visibleUnits = (() => {
    if (equipment && !unitsOpen) return [equipment];
    if (showAll) return filtered;
    const head = filtered.slice(0, COLLAPSED_UNITS);
    if (equipment && !head.some((e) => e.id === equipment.id)) head.push(equipment);
    return head;
  })();
  const hiddenUnits = equipment && !unitsOpen ? 0 : filtered.length - visibleUnits.length;

  const templates: ProblemTemplate[] = useMemo(
    () =>
      equipment
        ? (dirs?.problem_templates ?? [])
            .filter((p) => p.equipment_type === equipment.type)
            .sort((a, b) => a.sort - b.sort)
        : [],
    [dirs, equipment],
  );

  const deadlineCtx: DeadlineContext = { codeNormHours: codeNorm, priority: preset.priority };
  const descriptionText = description.trim();
  const ready = Boolean(equipment && descriptionText && assignee);
  const missing = [
    !equipment ? t('create.missing.equipment') : null,
    !descriptionText ? t('create.missing.description') : null,
    equipment && !assignee && !suggestQ.isFetching ? t('create.missing.assignee') : null,
  ].filter((x): x is string => Boolean(x));
  const dirty = Boolean(equipment || descriptionText || photos.count > 0 || comment.trim());
  // A filled draft does not close by a swipe; «Закрыть» asks first.
  const screenOptions = useMemo(() => ({ gestureEnabled: !dirty }), [dirty]);

  // ---------------------------------------------------------------------------------------------
  // handlers

  const choosePreset = (key: PresetKey) => {
    tap();
    if (key === presetKey) return;
    setPresetKey(key);
    setStopped(presetByKey(key).equipmentStopped);
  };

  const clearTemplateFor = (next: Equipment | null) => {
    if (template && (!next || template.equipment_type !== next.type)) {
      if (descriptionText === template.label) setDescription('');
      setTemplateId(null);
    }
  };

  const chooseArea = (id: number | null) => {
    tap();
    setAreaId(id);
    setUnitsOpen(true);
    if (id != null && equipment && equipment.area_id !== id) {
      clearTemplateFor(null);
      setEquipmentId(null);
    }
  };

  const chooseEquipment = (e: Equipment) => {
    tap();
    setError(null);
    if (e.id === equipmentId) return;
    clearTemplateFor(e);
    setEquipmentId(e.id);
    setAreaId(e.area_id);
    setUnitsOpen(false);
  };

  const chooseTemplate = (p: ProblemTemplate) => {
    tap();
    setError(null);
    if (templateId === p.id) {
      setTemplateId(null);
      if (descriptionText === p.label) setDescription('');
      return;
    }
    setTemplateId(p.id);
    setDescription(p.label);
  };

  const changeDescription = (text: string) => {
    setDescription(text);
    // Typed over the chip's text: the chip and its fault code no longer apply.
    if (template && !text.toLowerCase().includes(template.label.toLowerCase())) setTemplateId(null);
  };

  const addPhoto = async (from: 'camera' | 'library') => {
    tap();
    setPhotoNotice(null);
    try {
      const photo = await takeBeforePhoto(from);
      photos.add(photo);
    } catch (e) {
      if (e instanceof PhotoCancelled) return;
      setPhotoNotice(e instanceof PhotoPermissionDenied ? t('create.photos.permission') : t('create.photos.failed'));
    }
  };

  const removePhoto = async (id: string) => {
    tap();
    const ok = await confirm({
      title: t('create.photos.removeTitle'),
      confirmLabel: t('create.photos.removeConfirm'),
      destructive: true,
    });
    if (ok) photos.remove(id);
  };

  const askClose = async () => {
    if (!dirty || submitting) {
      if (!submitting) closeScreen();
      return;
    }
    const ok = await confirm({
      title: t('create.discard.title'),
      message: t('create.discard.message'),
      confirmLabel: t('create.discard.confirm'),
      destructive: true,
    });
    if (ok) closeScreen();
  };

  // Android back on a filled draft asks first, like «Закрыть» (the iOS swipe is off then). The pickers and
  // the confirm sheet are Modals, which take the back press before this handler.
  const askCloseRef = useRef(askClose);
  askCloseRef.current = askClose;
  useEffect(() => {
    if (!dirty) return;
    return onHardwareBack(() => {
      void askCloseRef.current();
      return true;
    });
  }, [dirty]);

  const submit = async () => {
    tap();
    if (!equipment || !assignee || !descriptionText || submitting) return;
    setSubmitting(true);
    setError(null);
    // One client_action_id per tap, reused for every retry of this tap (PHASE_2 §2.3).
    const clientActionId = newActionId();
    try {
      await photos.waitForUploads(PHOTO_WAIT_MS);
      const at = new Date();
      const trimmedComment = comment.trim();
      let input: CreateOrderInput = {
        type: preset.type,
        priority: preset.priority,
        description: descriptionText,
        equipment_id: equipment.id,
        area_id: equipment.area_id,
        client_ref: photos.clientRef(),
        equipment_stopped: stopped,
        suggested_fault_code: suggestedCode,
        ...(trimmedComment ? { comment: trimmedComment } : {}),
        ...(assignee.brigade_id != null
          ? { brigade_id: assignee.brigade_id }
          : { assignee_id: assignee.assignee_id ?? undefined }),
        ...deadlineInput(deadline, deadlineCtx, at),
      };
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const order = await api.orders.create(input, clientActionId);
          void haptic.success();
          void rememberEquipment(equipment.id);
          void Promise.all([
            qc.invalidateQueries({ queryKey: qk.orders }),
            qc.invalidateQueries({ queryKey: qk.workers }),
            qc.invalidateQueries({ queryKey: qk.brigades }),
            qc.invalidateQueries({ queryKey: qk.shift }),
            qc.invalidateQueries({ queryKey: ['equipment'] }),
          ]);
          const snap = counter.snapshot();
          hud.show({
            message: demoMode
              ? t('create.hud.issuedDemo', { taps: formatTaps(snap.taps, snap.seconds) })
              : t('create.hud.issued'),
            monoPrefix: `№${order.number}`,
            ...(demoMode ? { duration: DEMO_HUD_MS } : {}),
          });
          closeScreen();
          return;
        } catch (e) {
          if (isRotaError(e) && e.code === 'NOT_ON_SHIFT' && !input.allow_off_shift) {
            const ok = await confirm({
              title: t('error.NOT_ON_SHIFT_GENERIC'),
              message: assignee.short_name,
              confirmLabel: t('confirm.issueAnyway'),
            });
            if (!ok) return;
            input = { ...input, allow_off_shift: true };
            continue;
          }
          if (isRotaError(e) && e.code === 'NETWORK') {
            const ok = await confirm({ title: e.message, confirmLabel: t('common.retry') });
            if (ok) continue;
          }
          void haptic.error();
          setError(errorText(e));
          return;
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------------------------
  // layout

  const topBar = (
    <View
      style={[
        styles.topBar,
        {
          paddingTop: Platform.OS === 'ios' ? theme.space[2] : insets.top,
          paddingLeft: theme.space[1],
          paddingRight: theme.size.gutter,
          minHeight: theme.size.tapMin,
        },
      ]}
    >
      <Button label={t('create.close')} variant="ghost" onPress={() => void askClose()} />
      {demoMode ? <TapCounter text={counter.text} /> : null}
    </View>
  );

  if (!dirs) {
    return (
      <View style={[styles.fill, { backgroundColor: theme.color.bgCanvas }]}>
        {topBar}
        {dirsQ.isError ? (
          <EmptyState
            mascot="oops"
            title={t('create.loadError.title')}
            body={t('create.loadError.body')}
            action={<Button label={t('common.retry')} variant="secondary" onPress={() => void dirsQ.refetch()} />}
            style={styles.fill}
          />
        ) : (
          <View style={[styles.fill, styles.center, { gap: theme.space[3] }]}>
            <ActivityIndicator color={theme.color.textSecondary} />
            <T variant="callout" tone="secondary">
              {t('create.loading')}
            </T>
          </View>
        )}
      </View>
    );
  }

  const footer = (
    <>
      {error ? <Banner text={error} tone="critical" /> : null}
      {!ready && missing.length > 0 ? (
        <T variant="footnote" tone="secondary" align="center">
          {t('create.missing', { list: missing.join(', ') })}
        </T>
      ) : null}
      <Button
        label={t('create.submit')}
        size="L"
        full
        loading={submitting}
        disabled={!ready}
        onPress={() => void submit()}
        testID="create-submit"
      />
    </>
  );

  const chipRow = { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] } as const;

  return (
    <View style={[styles.fill, { backgroundColor: theme.color.bgCanvas }]}>
      <Stack.Screen options={screenOptions} />
      {topBar}
      <Screen
        insetTop={false}
        footer={footer}
        contentContainerStyle={{ gap: theme.space[6], paddingTop: theme.space[2] }}
      >
        <T variant="title1" accessibilityRole="header">
          {t('create.title')}
        </T>

        <Section title={t('create.section.preset')}>
          <View style={chipRow}>
            {PRESETS.map((p) => (
              <Chip
                key={p.key}
                label={t(p.labelKey)}
                variant={p.variant}
                selected={presetKey === p.key}
                onPress={() => choosePreset(p.key)}
              />
            ))}
          </View>
        </Section>

        <Section title={t('create.section.equipment')}>
          {/* All four areas stay visible (wrapped, never scrolled sideways): any unit is area then unit,
              two taps and no scrolling, which keeps the required fields within the case's 5 to 6 taps. */}
          <View style={chipRow}>
            <Chip label={t('create.area.all')} selected={areaId == null} onPress={() => chooseArea(null)} />
            {areas.map((a) => (
              <Chip
                key={a.id}
                label={a.name}
                selected={areaId === a.id}
                onPress={() => chooseArea(areaId === a.id ? null : a.id)}
              />
            ))}
          </View>
          <View style={chipRow}>
            {visibleUnits.map((e) => {
              const open = openCounts.get(e.id) ?? 0;
              return (
                <Chip
                  key={e.id}
                  label={e.name}
                  selected={equipmentId === e.id}
                  count={open > 0 ? open : undefined}
                  accessibilityLabel={
                    open > 0 ? `${e.name}, ${t('create.equipment.openOrders', { n: open })}` : e.name
                  }
                  onPress={() => chooseEquipment(e)}
                />
              );
            })}
            {equipment && !unitsOpen ? (
              <Chip
                label={t('create.equipment.other')}
                onPress={() => {
                  tap();
                  setUnitsOpen(true);
                }}
              />
            ) : null}
            {hiddenUnits > 0 ? (
              <Chip
                label={t('create.equipment.more', { n: hiddenUnits })}
                onPress={() => {
                  tap();
                  setExpanded(true);
                }}
              />
            ) : null}
          </View>
        </Section>

        <Section title={t('create.section.problem')}>
          {equipment ? (
            templates.length > 0 ? (
              <View style={chipRow}>
                {templates.map((p) => (
                  <Chip
                    key={p.id}
                    label={p.label}
                    selected={templateId === p.id}
                    onPress={() => chooseTemplate(p)}
                  />
                ))}
              </View>
            ) : null
          ) : (
            <T variant="callout" tone="secondary">
              {t('create.problem.hint')}
            </T>
          )}
          {faultCode ? (
            <View style={[styles.row, { gap: theme.space[2] }]}>
              <Tag label={faultCode.code} />
              <T variant="footnote" tone="secondary" style={styles.shrink} numberOfLines={2}>
                {codeNorm != null
                  ? `${faultCode.name} · ${t('create.problem.norm', { duration: formatDuration(codeNorm * 60) })}`
                  : faultCode.name}
              </T>
            </View>
          ) : null}
          <TextField
            label={t('create.problem.label')}
            placeholder={t('create.problem.placeholder')}
            value={description}
            onChangeText={changeDescription}
            onFocus={tap}
            returnKeyType="done"
            maxLength={500}
          />
        </Section>

        <Section title={t('create.section.assignee')}>
          <AssigneeCard
            equipmentChosen={equipment != null}
            loading={equipment != null && suggestQ.isPending}
            error={suggestQ.isError}
            top={top}
            manual={manual}
            manualSuggestion={manualSuggestion}
            brigadeName={brigadeName}
            onOther={() => {
              tap();
              setPickerOpen(true);
            }}
            onRetry={() => {
              tap();
              void suggestQ.refetch();
            }}
          />
        </Section>

        <Section title={t('create.section.deadline')}>
          <Chip
            label={`${deadlineText(deadline, deadlineCtx, now)} ›`}
            onPress={() => {
              tap();
              setDeadlineOpen(true);
            }}
          />
        </Section>

        <ListGroup>
          <ListRow
            title={t('create.stopped')}
            subtitle={stopped ? t('create.stopped.hint') : undefined}
            onPress={() => {
              tap();
              setStopped((v) => !v);
            }}
            right={
              <Switch
                value={stopped}
                accessibilityLabel={t('create.stopped')}
                onValueChange={(v) => {
                  tap();
                  setStopped(v);
                }}
              />
            }
          />
        </ListGroup>

        <Section
          title={t('create.section.photos')}
          right={
            photos.count < MAX_PHOTOS && !isSimulator ? (
              <Button
                label={t('create.photos.library')}
                variant="ghost"
                size="S"
                onPress={() => void addPhoto('library')}
              />
            ) : null
          }
        >
          <PhotoTile
            photos={photos.tiles}
            max={MAX_PHOTOS}
            addLabel={t('create.photos.add')}
            onAdd={() => void addPhoto('camera')}
            onRemove={(id) => void removePhoto(id)}
            onOpen={(id) => {
              if (photos.isFailed(id)) {
                tap();
                photos.retry(id);
              }
            }}
            photoLabel={t('create.photos.photo')}
            removeLabel={t('create.photos.remove')}
            errorLabel={t('create.photos.retry')}
          />
          {photos.failed > 0 ? <Banner text={t('create.photos.uploadFailed')} tone="warning" /> : null}
          {photoNotice ? <Banner text={photoNotice} tone="warning" /> : null}
          {isSimulator ? (
            <T variant="footnote" tone="secondary">
              {t('create.photos.simulator')}
            </T>
          ) : null}
        </Section>

        {commentOpen ? (
          <TextArea
            label={t('create.comment')}
            placeholder={t('create.comment.placeholder')}
            value={comment}
            onChangeText={setComment}
            autoFocus
            maxLength={500}
          />
        ) : (
          <ListGroup>
            <ListRow
              title={t('create.comment')}
              value={t('create.comment.add')}
              onPress={() => {
                tap();
                setCommentOpen(true);
              }}
            />
          </ListGroup>
        )}
      </Screen>

      <AssigneePicker
        visible={pickerOpen}
        equipmentId={equipmentId}
        specialty={specialty}
        selected={assignee}
        onTap={tap}
        onSelect={(sel) => {
          setError(null);
          // Picking the AI's first candidate keeps it an AI choice, so it follows a change of unit.
          const isTop = sel.brigade_id == null && top != null && sel.assignee_id === top.employee_id;
          setManual(isTop ? null : sel);
        }}
        onClose={() => setPickerOpen(false)}
      />
      <DeadlineSheet
        visible={deadlineOpen}
        value={deadline}
        context={deadlineCtx}
        demoMode={demoMode}
        now={now}
        onSelect={(c) => {
          tap();
          setDeadline(c);
          setDeadlineOpen(false);
        }}
        onClose={() => setDeadlineOpen(false)}
      />
    </View>
  );
}

function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.space[3] }}>
      <View style={[styles.row, styles.between, { minHeight: right ? theme.size.buttonS : undefined }]}>
        <Eyebrow accessibilityRole="header">{title}</Eyebrow>
        {right}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  row: { flexDirection: 'row', alignItems: 'center' },
  between: { justifyContent: 'space-between' },
  shrink: { flexShrink: 1 },
});
