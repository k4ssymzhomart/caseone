import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/lib/theme';

import type { StatusDotTone } from './StatusDot';
import { T } from './T';

/** Width of the status ring and of the gap that separates the dot from the background (PHASE_0 §6.9 Avatar). */
const RING = 2;

const LETTER = /^[A-Za-zА-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі]/;

/** «Ахметов Е.» → «АЕ», «Ахметов Ерлан» → «АЕ», «Ахметов» → «А». */
export function initialsFrom(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter((w) => LETTER.test(w))
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');
}

export interface AvatarProps {
  /** Short or full name; initials are derived from the first two words. */
  name?: string;
  /** Explicit initials, win over `name`. */
  initials?: string;
  /** Diameter, `theme.size.avatar` (40) by default. */
  size?: number;
  /** Optional status tone shown as a dot or a ring. Pair it with a word next to the avatar. */
  status?: StatusDotTone;
  /** 'dot' (default): 10 px dot at the bottom right. 'ring': 2 px ring around the circle (adds 8 to the outer size). */
  statusVariant?: 'dot' | 'ring';
  /** Color of the gap around the dot and inside the ring; the canvas by default, pass `bgSubtle` inside cards. */
  backdropColor?: string;
  /** Avatars are decorative unless a label is given. */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/** Initials circle, 40 px, `bgMuted`, footnote semibold (PHASE_0 §6.9). */
export function Avatar({
  name,
  initials,
  size,
  status,
  statusVariant = 'dot',
  backdropColor,
  accessibilityLabel,
  style,
}: AvatarProps) {
  const theme = useTheme();
  const d = size ?? theme.size.avatar;
  const text = (initials ?? (name ? initialsFrom(name) : '')).slice(0, 2);
  const variant = d >= theme.size.buttonL ? 'title2' : d >= theme.size.chip ? 'callout' : 'footnote';
  const backdrop = backdropColor ?? theme.color.bgCanvas;
  const statusColor = status ? (status === 'neutral' ? theme.color.textSecondary : theme.status[status]) : undefined;

  const circle = (
    <View
      style={{
        width: d,
        height: d,
        borderRadius: theme.radius.full,
        backgroundColor: theme.color.bgMuted,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <T variant={variant} weight="semibold" tone="primary" numberOfLines={1} maxFontSizeMultiplier={1.2}>
        {text}
      </T>
    </View>
  );

  const a11y = accessibilityLabel
    ? { accessible: true, accessibilityRole: 'image' as const, accessibilityLabel }
    : { accessible: false, importantForAccessibility: 'no-hide-descendants' as const };

  if (statusColor && statusVariant === 'ring') {
    return (
      <View
        {...a11y}
        style={[
          {
            alignSelf: 'flex-start',
            padding: RING,
            borderWidth: RING,
            borderColor: statusColor,
            borderRadius: theme.radius.full,
            backgroundColor: backdrop,
          },
          style,
        ]}
      >
        {circle}
      </View>
    );
  }

  const dot = theme.size.dot + RING * 2;
  return (
    <View {...a11y} style={[{ alignSelf: 'flex-start', width: d, height: d }, style]}>
      {circle}
      {statusColor ? (
        <View
          style={{
            position: 'absolute',
            right: -RING,
            bottom: -RING,
            width: dot,
            height: dot,
            borderRadius: theme.radius.full,
            borderWidth: RING,
            borderColor: backdrop,
            backgroundColor: statusColor,
          }}
        />
      ) : null}
    </View>
  );
}
