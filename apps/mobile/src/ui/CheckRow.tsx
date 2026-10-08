import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/lib/theme';

import { T } from './T';

/** Tinted glyph circle of a check row (PHASE_0 §6.9 CheckRow). */
const GLYPH_CIRCLE = 24;

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'info' | 'skipped';

export interface CheckRowProps {
  /** pass ✓ success · warn ! warning · fail ✕ critical · info and skipped … info. */
  status: CheckStatus;
  title: string;
  /** Explanation under the title, callout secondary. */
  message?: string;
  /** Points on the right in monoM, already formatted by the screen («18 из 20»). */
  points?: string;
  /** Spoken status word for screen readers («Пройдено», «Замечание», «Не пройдено»). */
  statusLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** One AI or rule check: glyph in a tinted circle, title, message, optional points (PHASE_0 §6.9). */
export function CheckRow({
  status,
  title,
  message,
  points,
  statusLabel,
  style,
  testID,
}: CheckRowProps) {
  const theme = useTheme();
  const look = {
    pass: { glyph: '✓', tone: 'success' },
    warn: { glyph: '!', tone: 'warning' },
    fail: { glyph: '✕', tone: 'critical' },
    info: { glyph: '…', tone: 'info' },
    skipped: { glyph: '…', tone: 'info' },
  } as const;
  const { glyph, tone } = look[status];
  const label = [statusLabel, title, message, points].filter(Boolean).join(', ');

  return (
    <View
      accessible
      accessibilityLabel={label}
      testID={testID}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'flex-start',
          paddingHorizontal: theme.space[4],
          paddingVertical: theme.space[3],
        },
        style,
      ]}
    >
      <View
        style={{
          width: GLYPH_CIRCLE,
          height: GLYPH_CIRCLE,
          borderRadius: theme.radius.full,
          backgroundColor: theme.statusSoft[tone],
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: theme.space[3],
        }}
      >
        <T variant="footnote" weight="bold" color={theme.status[tone]} align="center">
          {glyph}
        </T>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <T variant="body" weight="semibold">
          {title}
        </T>
        {message ? (
          <T variant="callout" tone="secondary">
            {message}
          </T>
        ) : null}
      </View>
      {points ? (
        <T
          variant="monoM"
          tone="secondary"
          numberOfLines={1}
          style={{ marginLeft: theme.space[3], marginTop: theme.space.half }}
        >
          {points}
        </T>
      ) : null}
    </View>
  );
}
