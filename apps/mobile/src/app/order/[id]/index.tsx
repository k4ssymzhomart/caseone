// Order card for the worker and the master (PHASE_0 §7.1, PHASE_2 §2.3): eyebrow and title, banners, the
// rework reasons, info, photos, the timeline and a sticky action bar of the moves this viewer may make.
import {
  STATUS_LABEL,
  formatDuration,
  isActive,
  minutesBetween,
  reasonLabel,
  statusTone,
  type OrderDetail,
  type OrderPhoto,
  type Priority,
  type Session,
} from '@rota/shared';
import { useQuery } from '@tanstack/react-query';
import { Redirect, router, useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

import { ReassignSheet } from '@/features/master/ReassignSheet';
import { availableActions, canPerform, isStaff, unjustifiedReject, type UiAction } from '@/features/orders/actions';
import { BackBar } from '@/features/orders/BackBar';
import { CancelSheet } from '@/features/orders/CancelSheet';
import { timelineItems } from '@/features/orders/events';
import { OrderActionBar } from '@/features/orders/OrderActionBar';
import { OrderInfo, WorkInfo } from '@/features/orders/OrderInfo';
import { PhotoViewer } from '@/features/orders/PhotoViewer';
import { PrioritySheet } from '@/features/orders/PrioritySheet';
import { orderBadge, orderEyebrow, pillTone, type Viewer } from '@/features/orders/present';
import { ReworkCard } from '@/features/orders/ReworkCard';
import { ErrorView, LoadingView } from '@/features/orders/StateViews';
import { useNow } from '@/features/orders/useNow';
import { isOrderGone, useOrderAction } from '@/features/orders/useOrderAction';
import { useApi, useSession } from '@/lib/api';
import { indexDirectories, useDirectories } from '@/lib/directories';
import { t } from '@/lib/i18n';
import { qk } from '@/lib/keys';
import { liveHub } from '@/lib/liveHub';
import { useTheme } from '@/lib/theme';
import { Banner } from '@/ui/Banner';
import { Card } from '@/ui/Card';
import { Eyebrow } from '@/ui/Eyebrow';
import { ListGroup } from '@/ui/ListGroup';
import { PhotoTile, type PhotoTileItem } from '@/ui/PhotoTile';
import { Pill } from '@/ui/Pill';
import { Screen } from '@/ui/Screen';
import { T } from '@/ui/T';
import { Tag } from '@/ui/Tag';
import { Timeline } from '@/ui/Timeline';

type Sheet = 'priority' | 'cancel' | null;

/** Timeline time column wide enough for «08.10 14:05» in monoM. */
const WIDE_TIME_COLUMN = 104;

export default function OrderScreen() {
  const session = useSession();
  if (!session) return <Redirect href={'/' as Href} />;
  return <OrderScreenBody session={session} />;
}

function OrderScreenBody({ session }: { session: Session }) {
  const theme = useTheme();
  const api = useApi();
  const now = useNow();
  const params = useLocalSearchParams<{ id: string; reassign?: string }>();
  const id = Number(params.id);
  const valid = Number.isInteger(id) && id > 0;
  const viewer: Viewer = session.role === 'worker' ? 'worker' : 'master';

  const query = useQuery({
    queryKey: qk.order(id),
    queryFn: () => api.orders.get(id),
    enabled: valid,
  });
  const dirs = useDirectories();
  const index = useMemo(() => (dirs.data ? indexDirectories(dirs.data) : null), [dirs.data]);

  const detail = query.data;
  const order = detail?.order;
  const photoPaths = useMemo(() => (detail ? detail.photos.map((p) => p.storage_path).sort() : []), [detail]);
  const urls = useQuery({
    queryKey: qk.photoUrls(photoPaths),
    queryFn: () => api.photos.urls(photoPaths),
    enabled: photoPaths.length > 0,
    staleTime: 30 * 60_000,
  });

  const { run, pending } = useOrderAction();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // An escalation notification opens /order/{id}?reassign={candidate}: the master lands in the reassign sheet.
  const autoReassign = useRef(false);
  useEffect(() => {
    if (autoReassign.current || !params.reassign || !order) return;
    autoReassign.current = true;
    if (canPerform('reassign', order, session)) setReassignOpen(true);
  }, [order, params.reassign, session]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    liveHub.resync();
    try {
      await query.refetch();
    } finally {
      setRefreshing(false);
    }
  }, [query]);

  const actions = useMemo(
    () => (detail ? availableActions(detail.order, session, detail.events, detail.reviews.length > 0) : []),
    [detail, session],
  );
  const pendingUi = actions.find((a) => a.action !== null && a.action === pending)?.id ?? null;

  const onAction = (a: UiAction) => {
    if (!detail) return;
    const o = detail.order;
    const n = o.number;
    switch (a.id) {
      case 'accept':
        void run(o.id, 'accept', {}, { success: t('order.hud.accepted'), number: n, strongHaptic: true });
        return;
      case 'queue':
        void run(o.id, 'queue', {}, { success: t('order.hud.queued'), number: n });
        return;
      case 'start':
        void run(o.id, 'start', {}, { success: t('order.hud.started'), number: n, strongHaptic: true });
        return;
      case 'resume':
        void run(o.id, 'resume', {}, { success: t('order.hud.resumed'), number: n, strongHaptic: true });
        return;
      case 'resume_rework':
        void run(o.id, 'resume_rework', {}, { success: t('order.hud.reworkStarted'), number: n, strongHaptic: true });
        return;
      case 'reject':
        router.push(`/order/${o.id}/reason?type=reject` as Href);
        return;
      case 'pause':
        router.push(`/order/${o.id}/reason?type=pause` as Href);
        return;
      case 'complete':
        router.push(`/order/${o.id}/close` as Href);
        return;
      case 'review':
        router.push(`/order/${o.id}/review` as Href);
        return;
      case 'reassign':
        setReassignOpen(true);
        return;
      case 'priority':
        setSheet('priority');
        return;
      case 'cancel':
        setSheet('cancel');
        return;
      case 'justify': {
        const rej = unjustifiedReject(detail.events);
        if (rej) void run(o.id, 'mark_reject_justified', { reject_event_id: rej.id }, { success: t('order.hud.justified'), number: n });
        return;
      }
    }
  };

  const savePriority = async (priority: Priority) => {
    if (!order) return;
    const done = await run(order.id, 'set_priority', { priority }, { success: t('order.hud.priority'), number: order.number });
    if (done) setSheet(null);
  };

  const cancelOrder = async (reason: string) => {
    if (!order) return;
    const done = await run(order.id, 'cancel', { reason }, { success: t('order.hud.cancelled'), number: order.number });
    if (done) setSheet(null);
  };

  if (!valid) {
    return (
      <Screen>
        <BackBar />
        <ErrorView title={t('order.detail.badId')} />
      </Screen>
    );
  }

  // Reassigned away from me (RLS hides it now) or removed by a demo reset: no stale card with dead buttons.
  if (query.isError && isOrderGone(query.error)) {
    return (
      <Screen>
        <BackBar />
        <ErrorView title={t('order.detail.gone')} mascot="peek" />
      </Screen>
    );
  }

  if (!detail || !order) {
    return (
      <Screen>
        <BackBar />
        {query.isError ? (
          <ErrorView title={t('order.detail.loadError')} error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <LoadingView />
        )}
      </Screen>
    );
  }

  const overdue = isActive(order.status) && now.getTime() > Date.parse(order.due_at);
  const badge = orderBadge(order);
  const urlOf = (p: OrderPhoto) => urls.data?.[p.storage_path];
  const tiles = (kind: OrderPhoto['kind']): PhotoTileItem[] =>
    detail.photos
      .filter((p) => p.kind === kind)
      .flatMap((p) => {
        const uri = urlOf(p);
        return uri ? [{ id: String(p.id), uri }] : [];
      });
  const before = tiles('before');
  const after = tiles('after');
  const openPhoto = (photoId: string) => {
    const p = detail.photos.find((x) => String(x.id) === photoId);
    const uri = p ? urlOf(p) : undefined;
    if (uri) setPhoto(uri);
  };

  const timeline = timelineItems(
    detail.events,
    { order, employees: index?.employees ?? new Map() },
    now,
  );

  return (
    <View style={{ flex: 1 }}>
      <Screen
        refreshing={refreshing}
        onRefresh={() => void onRefresh()}
        footer={
          actions.length > 0 ? <OrderActionBar actions={actions} pending={pendingUi} onPress={onAction} /> : undefined
        }
        testID="order-screen"
      >
        <BackBar />
        <View style={{ gap: theme.space[1], marginBottom: theme.space[4] }}>
          <Eyebrow tone={order.priority === 'emergency' ? 'critical' : 'secondary'}>{orderEyebrow(order)}</Eyebrow>
          <T variant="title1" accessibilityRole="header">
            {order.equipment_name}
          </T>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: theme.space[2], marginBottom: theme.space[6] }}>
          <Pill
            label={STATUS_LABEL[order.status]}
            tone={pillTone(overdue ? 'critical' : statusTone(order.status))}
            size={viewer === 'worker' ? 'L' : 'M'}
          />
          {badge ? <Tag label={badge.text} tone={badge.tone} /> : null}
          {overdue && !badge ? <Tag label={t('order.badge.overdue')} tone="critical" /> : null}
        </View>

        <View style={{ gap: theme.space[6] }}>
          <Banners detail={detail} overdue={overdue} now={now} />
          {order.status === 'rework' ? <ReworkCard detail={detail} /> : null}

          <OrderInfo
            order={order}
            viewer={viewer}
            now={now}
            {...(viewer === 'master' ? { onOpenEquipment: () => router.push(`/equipment/${order.equipment_id}` as Href) } : {})}
          />

          <WorkInfo
            order={order}
            materials={detail.materials}
            faultCodes={index?.faultCodes ?? new Map()}
            viewer={viewer}
          />

          {before.length > 0 ? (
            <ListGroup header={t('order.detail.photosBefore')}>
              <View style={{ padding: theme.space[4] }}>
                <PhotoTile photos={before} readOnly onOpen={openPhoto} photoLabel={t('order.detail.photo')} />
              </View>
            </ListGroup>
          ) : null}

          {after.length > 0 ? (
            <ListGroup header={t('order.detail.photosAfter')}>
              <View style={{ padding: theme.space[4] }}>
                <PhotoTile photos={after} readOnly onOpen={openPhoto} photoLabel={t('order.detail.photo')} />
              </View>
            </ListGroup>
          ) : null}

          {timeline.items.length > 0 ? (
            <View>
              <T
                variant="monoCaps"
                tone="secondary"
                accessibilityRole="header"
                style={{ paddingHorizontal: theme.space[4], marginBottom: theme.space[2] }}
              >
                {t('order.detail.timeline')}
              </T>
              <Card>
                <Timeline items={timeline.items} {...(timeline.wide ? { timeColumnWidth: WIDE_TIME_COLUMN } : {})} />
              </Card>
            </View>
          ) : null}
        </View>
      </Screen>

      {sheet === 'priority' ? (
        <PrioritySheet
          order={order}
          pending={pending === 'set_priority'}
          onSave={(p) => void savePriority(p)}
          onClose={() => setSheet(null)}
        />
      ) : null}
      {sheet === 'cancel' ? (
        <CancelSheet
          order={order}
          pending={pending === 'cancel'}
          onCancel={(reason) => void cancelOrder(reason)}
          onClose={() => setSheet(null)}
        />
      ) : null}
      {isStaff(session) ? (
        <ReassignSheet
          visible={reassignOpen}
          order={order}
          onClose={() => setReassignOpen(false)}
          preselectId={params.reassign ?? null}
          run={run}
        />
      ) : null}
      <PhotoViewer uri={photo} onClose={() => setPhoto(null)} />
    </View>
  );
}

function Banners({ detail, overdue, now }: { detail: OrderDetail; overdue: boolean; now: Date }) {
  const theme = useTheme();
  const o = detail.order;
  const items: { key: string; text: string; tone: 'critical' | 'warning' | 'info' }[] = [];
  if (overdue) {
    const duration = formatDuration(Math.max(1, minutesBetween(o.due_at, now)));
    items.push({ key: 'overdue', text: t('order.banner.overdue', { duration }), tone: 'critical' });
  }
  if (o.status === 'paused') {
    items.push({ key: 'paused', text: t('order.banner.paused', { reason: reasonLabel(o.last_reason) }), tone: 'warning' });
  }
  if (o.status === 'rejected') {
    items.push({ key: 'rejected', text: t('order.banner.rejected', { reason: reasonLabel(o.last_reason) }), tone: 'critical' });
  }
  if (o.status === 'cancelled') items.push({ key: 'cancelled', text: t('order.banner.cancelled'), tone: 'info' });
  if (o.status === 'ai_review') {
    if (o.ai_needs_master_review) items.push({ key: 'ai', text: t('order.banner.waitsMaster'), tone: 'warning' });
    else if (!o.ai_verdict) items.push({ key: 'ai', text: t('order.banner.aiReview'), tone: 'info' });
  }
  if (items.length === 0) return null;
  return (
    <View style={{ gap: theme.space[2] }}>
      {items.map((b) => (
        <Banner key={b.key} text={b.text} tone={b.tone} />
      ))}
    </View>
  );
}
