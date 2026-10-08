import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/lib/theme';

import { T } from './T';

/** Left time column, fits «HH:MM» in monoM (PHASE_0 §6.9 Timeline). */
const TIME_COLUMN = 56;

export type TimelineTone =
  'neutral' | 'success' | 'warning' | 'critical' | 'info' | 'working' | 'queue';

export interface TimelineItem {
  id: string;
  /** Already formatted time, «11:30». */
  time: string;
  /** Actor, callout semibold («Ахметов Е.», «ИИ»). */
  title: string;
  /** Action text, callout secondary («Принял в работу»). */
  subtitle?: string;
  /** Dot tint: critical for overdue and rework, success for closed. Neutral by default. */
  tone?: TimelineTone;
}

export interface TimelineProps {
  items: readonly TimelineItem[];
  /** Width of the time column, 56 by default; widen it for «08.10 11:30». */
  timeColumnWidth?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Vertical event list: time in monoM, a dot on a hairline rail, actor and action (PHASE_0 §6.9). */
export function Timeline({ items, timeColumnWidth = TIME_COLUMN, style, testID }: TimelineProps) {
  const theme = useTheme();
  const dot = theme.size.dot;
  const lineHeight = theme.type.callout.lineHeight;
  // Centre the dot on the first text line.
  const dotTop = (lineHeight - dot) / 2;

  return (
    <View style={style} testID={testID}>
      {items.map((item, i) => {
        const first = i === 0;
        const last = i === items.length - 1;
        const tone = item.tone ?? 'neutral';
        const dotColor = tone === 'neutral' ? theme.status.off : theme.status[tone];
        return (
          <View
            key={item.id}
            accessible
            accessibilityLabel={[item.time, item.title, item.subtitle].filter(Boolean).join(', ')}
            style={{ flexDirection: 'row', alignItems: 'stretch' }}
          >
            <T
              variant="monoM"
              tone="secondary"
              numberOfLines={1}
              style={{ width: timeColumnWidth }}
            >
              {item.time}
            </T>
            <View style={{ width: dot, marginHorizontal: theme.space[3] }}>
              {items.length > 1 ? (
                <View
                  style={{
                    position: 'absolute',
                    left: (dot - StyleSheet.hairlineWidth) / 2,
                    width: StyleSheet.hairlineWidth,
                    top: first ? dotTop + dot / 2 : 0,
                    bottom: last ? undefined : 0,
                    height: last ? dotTop + dot / 2 : undefined,
                    backgroundColor: theme.color.borderStrong,
                  }}
                />
              ) : null}
              <View
                style={{
                  marginTop: dotTop,
                  width: dot,
                  height: dot,
                  borderRadius: theme.radius.full,
                  backgroundColor: dotColor,
                }}
              />
            </View>
            <View style={{ flex: 1, minWidth: 0, paddingBottom: last ? 0 : theme.space[4] }}>
              <T variant="callout" weight="semibold">
                {item.title}
              </T>
              {item.subtitle ? (
                <T variant="callout" tone="secondary">
                  {item.subtitle}
                </T>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}
