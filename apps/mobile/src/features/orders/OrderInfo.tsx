// The info groups of order/[id]: what, where, how urgent, until when, who; then the closing data once
// the work is done. Label above value, so long equipment names and descriptions never get cut.
import {
  ORDER_TYPE_LABEL,
  PRIORITY_LABEL,
  formatDateTime,
  formatDuration,
  formatLeft,
  formatNumber,
  hhmm,
  isActive,
  isToday,
  minutesBetween,
  type FaultCode,
  type OrderMaterialView,
  type OrderView,
} from '@rota/shared';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { t } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { ListGroup } from '@/ui/ListGroup';
import { T } from '@/ui/T';

import type { Viewer } from './present';

export interface InfoRowProps {
  label: string;
  value: string;
  /** Geist Mono for codes and times. */
  mono?: boolean;
  /** Value in the critical tone (overdue deadline). */
  critical?: boolean;
  onPress?: () => void;
  viewer: Viewer;
  testID?: string;
}

/** One info row: footnote label above a body value; worker rows use bodyL and 64 px. */
export function InfoRow({ label, value, mono, critical, onPress, viewer, testID }: InfoRowProps) {
  const theme = useTheme();
  const [pressed, setPressed] = useState(false);
  const worker = viewer === 'worker';
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
      <View style={{ flex: 1, minWidth: 0, gap: theme.space.half }}>
        <T variant="footnote" tone="secondary">
          {label}
        </T>
        <T variant={mono ? 'monoL' : worker ? 'bodyL' : 'body'} tone={critical ? 'critical' : 'primary'}>
          {value}
        </T>
      </View>
      {onPress ? (
        <T variant={worker ? 'bodyL' : 'body'} tone="secondary" importantForAccessibility="no" accessibilityElementsHidden>
          ›
        </T>
      ) : null}
    </View>
  );
  const style = {
    minHeight: worker ? theme.size.rowWorker : theme.size.rowMaster,
    justifyContent: 'center' as const,
    paddingHorizontal: theme.space[4],
    paddingVertical: theme.space[3],
    backgroundColor: pressed ? theme.color.bgMuted : 'transparent',
  };
  if (!onPress) {
    return (
      <View style={style} accessible accessibilityLabel={`${label}, ${value}`} testID={testID}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value}`}
      style={style}
      testID={testID}
    >
      {body}
    </Pressable>
  );
}

/** «до 11:30 · осталось 24 мин», «до 11:30 · просрочен на 12 мин», «до 11:30 · срок нарушен на 5 мин». */
export function dueText(o: OrderView, now: Date): { text: string; critical: boolean } {
  const time = isToday(o.due_at, now) ? hhmm(o.due_at) : formatDateTime(o.due_at);
  if (isActive(o.status)) {
    const late = now.getTime() > Date.parse(o.due_at);
    return { text: t('order.detail.dueActive', { time, left: formatLeft(o.due_at, now) }), critical: late };
  }
  if (o.done_at && Date.parse(o.done_at) > Date.parse(o.due_at)) {
    const duration = formatDuration(Math.max(1, minutesBetween(o.due_at, o.done_at)));
    return { text: t('order.detail.dueLate', { time, duration }), critical: false };
  }
  return { text: t('order.detail.dueDone', { time }), critical: false };
}

export interface OrderInfoProps {
  order: OrderView;
  viewer: Viewer;
  now: Date;
  /** Master only: the equipment row opens the unit's history. */
  onOpenEquipment?: () => void;
}

export function OrderInfo({ order: o, viewer, now, onOpenEquipment }: OrderInfoProps) {
  const due = dueText(o, now);
  const person =
    viewer === 'master'
      ? { label: t('order.detail.assignee'), value: o.brigade_name ? `${o.assignee_short_name} · ${o.brigade_name}` : o.assignee_short_name }
      : { label: t('order.detail.master'), value: o.master_short_name };
  const showLast = o.last_comment && o.last_comment !== o.comment && o.last_comment !== o.closing_comment;

  return (
    <ListGroup header={t('order.detail.info')}>
      <InfoRow viewer={viewer} label={t('order.detail.area')} value={o.area_name} />
      <InfoRow
        viewer={viewer}
        label={t('order.detail.equipment')}
        value={o.equipment_stopped ? `${o.equipment_name} · ${t('order.detail.stopped')}` : o.equipment_name}
        {...(onOpenEquipment ? { onPress: onOpenEquipment } : {})}
        testID="order-equipment"
      />
      <InfoRow
        viewer={viewer}
        label={t('order.detail.priority')}
        value={
          // A planned order with the planned priority would read «Плановый · Плановый»: say it once.
          PRIORITY_LABEL[o.priority] === ORDER_TYPE_LABEL[o.type]
            ? PRIORITY_LABEL[o.priority]
            : `${PRIORITY_LABEL[o.priority]} · ${ORDER_TYPE_LABEL[o.type]}`
        }
        critical={o.priority === 'emergency'}
      />
      <InfoRow viewer={viewer} label={t('order.detail.due')} value={due.text} critical={due.critical} />
      <InfoRow viewer={viewer} label={person.label} value={person.value} />
      <InfoRow viewer={viewer} label={t('order.detail.description')} value={o.description} />
      {o.comment ? <InfoRow viewer={viewer} label={t('order.detail.comment')} value={o.comment} /> : null}
      {showLast && o.last_comment ? (
        <InfoRow viewer={viewer} label={t('order.detail.lastComment')} value={o.last_comment} />
      ) : null}
    </ListGroup>
  );
}

export interface WorkInfoProps {
  order: OrderView;
  materials: readonly OrderMaterialView[];
  faultCodes: ReadonlyMap<string, FaultCode>;
  viewer: Viewer;
}

/** What the worker reported with «Исполнено»: works, fault code, materials, closing comment. */
export function WorkInfo({ order: o, materials, faultCodes, viewer }: WorkInfoProps) {
  if (!o.works_done && !o.fault_code && materials.length === 0 && !o.closing_comment) return null;
  const code = o.fault_code ? faultCodes.get(o.fault_code) : undefined;
  const lines = materials.map((m) =>
    t('order.detail.materialLine', { name: m.material_name, qty: formatNumber(m.qty, 2), unit: m.unit }),
  );
  return (
    <ListGroup header={t('order.detail.work')}>
      {o.works_done ? <InfoRow viewer={viewer} label={t('order.detail.worksDone')} value={o.works_done} /> : null}
      {o.fault_code ? (
        <InfoRow
          viewer={viewer}
          label={t('order.detail.faultCode')}
          value={code ? `${o.fault_code} · ${code.name}` : o.fault_code}
        />
      ) : null}
      <InfoRow
        viewer={viewer}
        label={t('order.detail.materials')}
        value={lines.length > 0 ? lines.join('\n') : t('common.no_materials')}
      />
      {o.closing_comment ? (
        <InfoRow viewer={viewer} label={t('order.detail.comment')} value={o.closing_comment} />
      ) : null}
    </ListGroup>
  );
}
