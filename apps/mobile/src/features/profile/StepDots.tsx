import { View } from 'react-native';

import { t } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';

export interface StepDotsProps {
  count: number;
  /** Zero based index of the current step. */
  active: number;
}

/** Onboarding step dots like Rota onboarding: the current step is a short red pill, the others small dots. */
export function StepDots({ count, active }: StepDotsProps) {
  const theme = useTheme();
  const dot = theme.space[2] - theme.space.half; // 6
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={t('onboarding.steps', { n: active + 1, total: count })}
      style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: theme.space[1] + theme.space.half }}
    >
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={{
            width: i === active ? dot * 3 : dot,
            height: dot,
            borderRadius: theme.radius.full,
            backgroundColor: i === active ? theme.color.bgAccent : theme.color.borderStrong,
          }}
        />
      ))}
    </View>
  );
}
