import type { MascotName } from '@rota/design';
import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/lib/theme';

import { Mascot } from './Mascot';
import { T } from './T';

/** Mascot size on empty states (PHASE_0 §6.9 EmptyState). */
const MASCOT_SIZE = 140;

export interface EmptyStateProps {
  /** Pose by moment (PHASE_0 §6.11): peek for an empty queue, sleep for off shift, oops for errors. */
  mascot: MascotName;
  /** Default 140 (PHASE_0 §6.9). */
  mascotSize?: number;
  title: string;
  body?: string;
  /** Optional secondary action, usually `<Button variant="secondary" …>` from the screen. */
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Empty, success, error and waiting states: mascot, title2, callout secondary, one optional action. */
export function EmptyState({
  mascot,
  mascotSize = MASCOT_SIZE,
  title,
  body,
  action,
  style,
}: EmptyStateProps) {
  const theme = useTheme();
  return (
    <View
      style={[
        {
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: theme.size.gutter,
          paddingVertical: theme.space[8],
        },
        style,
      ]}
    >
      <Mascot name={mascot} size={mascotSize} />
      <T
        variant="title2"
        align="center"
        accessibilityRole="header"
        style={{ marginTop: theme.space[5] }}
      >
        {title}
      </T>
      {body ? (
        <T variant="callout" tone="secondary" align="center" style={{ marginTop: theme.space[2] }}>
          {body}
        </T>
      ) : null}
      {action ? (
        // The inner view hugs the action, so a Button (alignSelf flex-start) still lands in the center.
        <View style={{ marginTop: theme.space[6], alignSelf: 'stretch', alignItems: 'center' }}>
          <View>{action}</View>
        </View>
      ) : null}
    </View>
  );
}
