import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/lib/theme';

import { PressableScale } from './PressableScale';
import { T } from './T';

export type BannerTone = 'warning' | 'critical' | 'info';

const GLYPH: Record<BannerTone, string> = { warning: '!', critical: '!', info: '…' };

export interface BannerProps {
  text: string;
  tone?: BannerTone;
  /** Overrides the default glyph («!» warning and critical, «…» info). Allowlist glyphs only. */
  glyph?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}

/** Inline notice on a soft tinted fill, e.g. «Без фото после ИИ может вернуть наряд» (PHASE_0 §6.9). */
export function Banner({ text, tone = 'warning', glyph, actionLabel, onAction, style }: BannerProps) {
  const theme = useTheme();
  const hasAction = !!actionLabel && !!onAction;
  const circle = theme.space[6]; // 24 px glyph circle
  // Dark ink on orange reads better than white; red and blue carry white.
  const glyphColor = tone === 'warning' ? theme.status.onWorking : theme.color.textOnAccent;

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.space[3],
          minHeight: theme.size.tapMin,
          paddingLeft: theme.space[4],
          paddingRight: hasAction ? theme.space[1] : theme.space[4],
          paddingVertical: hasAction ? theme.space[1] : theme.space[3],
          borderRadius: theme.radius.md,
          backgroundColor: theme.statusSoft[tone],
        },
        style,
      ]}
    >
      <View
        accessible
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        accessibilityLabel={text}
        style={{
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.space[3],
          paddingVertical: hasAction ? theme.space[2] : 0,
        }}
      >
        <View
          style={{
            width: circle,
            height: circle,
            borderRadius: theme.radius.full,
            backgroundColor: theme.status[tone],
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <T variant="footnote" weight="bold" color={glyphColor} maxFontSizeMultiplier={1}>
            {glyph ?? GLYPH[tone]}
          </T>
        </View>
        <T variant="callout" tone="primary" style={{ flex: 1 }}>
          {text}
        </T>
      </View>
      {hasAction ? (
        <PressableScale
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          style={{
            minHeight: theme.size.tapMin,
            minWidth: theme.size.tapMin,
            paddingHorizontal: theme.space[3],
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: theme.radius.full,
          }}
        >
          <T variant="callout" weight="semibold" tone="primary" numberOfLines={1}>
            {actionLabel}
          </T>
        </PressableScale>
      ) : null}
    </View>
  );
}
