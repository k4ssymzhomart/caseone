import { useState, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/lib/theme';

import { PressableScale } from './PressableScale';
import { T } from './T';

/** Disabled rows dim like disabled buttons (PHASE_0 §6.9 Button). */
const DISABLED_OPACITY = 0.4;

export type ListRowDensity = 'master' | 'worker';

export interface ListRowProps {
  title: string;
  /** Second line, callout secondary. */
  subtitle?: string;
  /** Left slot, for example a StatusDot or an Avatar. */
  left?: ReactNode;
  /** Right value text, callout secondary (monoM with `mono`). */
  value?: string;
  /** Render the value in Geist Mono (codes, times, counts). */
  mono?: boolean;
  /** Any right accessory node (Switch, Pill, Tag). Shown after the value. */
  right?: ReactNode;
  /** Shows the › chevron. Defaults to true when `onPress` is set and there is no `right` node. */
  showChevron?: boolean;
  onPress?: () => void;
  /** 'master' rows are at least 56 high with body text; 'worker' rows 64 with bodyL (PHASE_0 §6.5). */
  density?: ListRowDensity;
  /** Title in the critical tone, for destructive rows. */
  destructive?: boolean;
  disabled?: boolean;
  /** Max lines for the title, 2 by default. */
  titleLines?: number;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Rota Settings Row (PHASE_0 §6.9). Pressable rows highlight with `bgMuted` instead of scaling. */
export function ListRow({
  title,
  subtitle,
  left,
  value,
  mono,
  right,
  showChevron,
  onPress,
  density = 'master',
  destructive,
  disabled,
  titleLines = 2,
  accessibilityLabel,
  accessibilityHint,
  style,
  testID,
}: ListRowProps) {
  const theme = useTheme();
  const [pressed, setPressed] = useState(false);
  const worker = density === 'worker';
  const chevron = onPress ? (showChevron ?? !right) : false;

  const content = (
    <View
      style={{
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        opacity: disabled ? DISABLED_OPACITY : 1,
      }}
    >
      {left ? <View style={{ marginRight: theme.space[3] }}>{left}</View> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <T
          variant={worker ? 'bodyL' : 'body'}
          tone={destructive ? 'critical' : 'primary'}
          numberOfLines={titleLines}
        >
          {title}
        </T>
        {subtitle ? (
          <T variant="callout" tone="secondary" numberOfLines={2}>
            {subtitle}
          </T>
        ) : null}
      </View>
      {value ? (
        <T
          variant={mono ? 'monoM' : 'callout'}
          tone="secondary"
          numberOfLines={1}
          style={{ marginLeft: theme.space[3], flexShrink: 1, maxWidth: '50%' }}
        >
          {value}
        </T>
      ) : null}
      {right ? <View style={{ marginLeft: theme.space[3] }}>{right}</View> : null}
      {chevron ? (
        <T
          variant={worker ? 'bodyL' : 'body'}
          tone="secondary"
          importantForAccessibility="no"
          accessibilityElementsHidden
          style={{ marginLeft: theme.space[2] }}
        >
          ›
        </T>
      ) : null}
    </View>
  );

  const rowStyle: StyleProp<ViewStyle> = [
    {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: worker ? theme.size.rowWorker : theme.size.rowMaster,
      paddingHorizontal: theme.space[4],
      paddingVertical: theme.space[3],
      backgroundColor: pressed ? theme.color.bgMuted : 'transparent',
    },
    style,
  ];

  if (!onPress) {
    return (
      <View
        style={rowStyle}
        testID={testID}
        accessible={!!accessibilityLabel}
        accessibilityLabel={accessibilityLabel}
      >
        {content}
      </View>
    );
  }

  const label = accessibilityLabel ?? [title, subtitle, value].filter(Boolean).join(', ');

  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      scaleTo={1}
      pressedOpacity={1}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
      testID={testID}
      style={rowStyle}
    >
      {content}
    </PressableScale>
  );
}
