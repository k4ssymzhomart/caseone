import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/lib/theme';

import { T } from './T';

export type TagTone = 'neutral' | 'critical' | 'warning' | 'info' | 'accent';

export interface TagProps {
  label: string;
  /** neutral (fault codes), critical (emergency), warning (high), info (planned), accent (filled red, the «ИИ» tag). */
  tone?: TagTone;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/** Rota Layout Tag: a mono caps capsule with a hairline border, 22 high (PHASE_0 §6.9). */
export function Tag({ label, tone = 'neutral', accessibilityLabel, style }: TagProps) {
  const theme = useTheme();
  const dark = theme.mode === 'dark';

  let borderColor: string;
  let backgroundColor = 'transparent';
  let textColor: string;
  switch (tone) {
    case 'neutral':
      borderColor = theme.color.borderStrong;
      textColor = theme.color.textSecondary;
      break;
    case 'accent':
      borderColor = theme.color.bgAccent;
      backgroundColor = theme.color.bgAccent;
      textColor = theme.color.textOnAccent;
      break;
    case 'critical':
      borderColor = theme.status.critical;
      backgroundColor = theme.statusSoft.critical;
      // Red 500 text fails 4.5:1 on white, so light mode uses the darker accent text.
      textColor = dark ? theme.status.critical : theme.color.textAccent;
      break;
    case 'warning':
    case 'info':
      borderColor = theme.status[tone];
      backgroundColor = theme.statusSoft[tone];
      // Orange and blue text are too light on white: light mode keeps the tint and uses primary text.
      textColor = dark ? theme.status[tone] : theme.color.textPrimary;
      break;
  }

  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel ?? label}
      style={[
        {
          alignSelf: 'flex-start',
          flexDirection: 'row',
          alignItems: 'center',
          height: theme.size.tag,
          paddingHorizontal: theme.space[2],
          borderRadius: theme.radius.full,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor,
          backgroundColor,
        },
        style,
      ]}
    >
      <T variant="monoCaps" color={textColor} numberOfLines={1}>
        {label}
      </T>
    </View>
  );
}
