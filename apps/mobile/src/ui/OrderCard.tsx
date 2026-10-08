import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/lib/theme';

import { Eyebrow } from './Eyebrow';
import { Pill, type PillTone } from './Pill';
import { PressableScale } from './PressableScale';
import { T } from './T';
import { Tag, type TagTone } from './Tag';

/** Priority bar on the left edge of the card (PHASE_0 §6.9 OrderCard). */
const PRIORITY_BAR = 4;
/** Minimum card height (PHASE_0 §6.9 OrderCard). */
const MIN_HEIGHT = 112;

export type Priority = 'emergency' | 'high' | 'normal' | 'planned';

export interface OrderCardProps {
  /** Mono caps line above the equipment, «№147 · ВНЕПЛАНОВЫЙ». Critical tone on emergency orders. */
  eyebrow: string;
  /** Equipment name, headline. */
  equipment: string;
  /** «Участок обогащения · Течь масла», callout secondary. */
  subtitle?: string;
  /** emergency → red bar, high → orange, normal → no bar, planned → blue (PHASE_0 §6.3). */
  priority?: Priority;
  /** Time left or late, monoL on the right («1:24», «−12 мин»). */
  timeLeft?: string;
  /** Paints `timeLeft` red. */
  overdue?: boolean;
  /** Status word for the pill («В работе»). */
  statusLabel: string;
  statusTone?: PillTone;
  /** Optional badge next to the pill («Пауза: Ожидание запчастей», «Доработка», «Отклонён: Нет допуска»). */
  badge?: string;
  badgeTone?: TagTone;
  /** Name on the right of the bottom row: the assignee for the master, the master for the worker. */
  person?: string;
  /** Optional node in the top right corner, above the time. */
  rightTop?: ReactNode;
  onPress?: () => void;
  /** Spoken label; by default the visible strings joined. */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Presentational order card (PHASE_0 §6.9): priority bar, eyebrow, equipment, place and problem, time, status. */
export function OrderCard({
  eyebrow,
  equipment,
  subtitle,
  priority = 'normal',
  timeLeft,
  overdue,
  statusLabel,
  statusTone = 'neutral',
  badge,
  badgeTone = 'neutral',
  person,
  rightTop,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  style,
  testID,
}: OrderCardProps) {
  const theme = useTheme();
  const barColor: Record<Priority, string> = {
    emergency: theme.status.critical,
    high: theme.status.warning,
    normal: 'transparent',
    planned: theme.status.info,
  };
  const label =
    accessibilityLabel ??
    [eyebrow, equipment, subtitle, statusLabel, badge, timeLeft, person].filter(Boolean).join(', ');

  const cardStyle: StyleProp<ViewStyle> = [
    {
      flexDirection: 'row',
      minHeight: MIN_HEIGHT,
      backgroundColor: theme.color.bgSubtle,
      borderRadius: theme.radius.md,
      overflow: 'hidden',
      borderWidth: theme.mode === 'light' ? StyleSheet.hairlineWidth : 0,
      borderColor: theme.color.borderDefault,
    },
    style,
  ];

  const body = (
    <>
      <View style={{ width: PRIORITY_BAR, backgroundColor: barColor[priority] }} />
      <View
        style={{
          flex: 1,
          minWidth: 0,
          justifyContent: 'space-between',
          paddingVertical: theme.space[4],
          // The bar plus this padding puts the text 16 from the card edge.
          paddingLeft: theme.space[3],
          paddingRight: theme.space[4],
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Eyebrow tone={priority === 'emergency' ? 'critical' : 'secondary'}>{eyebrow}</Eyebrow>
            <T variant="headline" numberOfLines={2} style={{ marginTop: theme.space[1] }}>
              {equipment}
            </T>
            {subtitle ? (
              <T
                variant="callout"
                tone="secondary"
                numberOfLines={2}
                style={{ marginTop: theme.space.half }}
              >
                {subtitle}
              </T>
            ) : null}
          </View>
          {rightTop || timeLeft ? (
            <View
              style={{ marginLeft: theme.space[3], alignItems: 'flex-end', gap: theme.space[1] }}
            >
              {rightTop}
              {timeLeft ? (
                <T variant="monoL" tone={overdue ? 'critical' : 'primary'} numberOfLines={1}>
                  {timeLeft}
                </T>
              ) : null}
            </View>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: theme.space[3] }}>
          <View
            style={{
              flex: 1,
              flexDirection: 'row',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: theme.space[2],
            }}
          >
            <Pill label={statusLabel} tone={statusTone} />
            {badge ? <Tag label={badge} tone={badgeTone} /> : null}
          </View>
          {person ? (
            <T
              variant="callout"
              tone="secondary"
              numberOfLines={1}
              style={{ marginLeft: theme.space[3], flexShrink: 1, maxWidth: '45%' }}
            >
              {person}
            </T>
          ) : null}
        </View>
      </View>
    </>
  );

  if (!onPress) {
    return (
      <View accessible accessibilityLabel={label} testID={testID} style={cardStyle}>
        {body}
      </View>
    );
  }

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      testID={testID}
      style={cardStyle}
    >
      {body}
    </PressableScale>
  );
}
