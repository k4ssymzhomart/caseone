// One section of the close form: a title2 heading and its content, 32 apart from the next section.
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/lib/theme';
import { T } from '@/ui/T';

export interface FormSectionProps {
  title: string;
  /** Accessory at the right of the heading (a tag, a count). */
  right?: ReactNode;
  children: ReactNode;
}

export function FormSection({ title, right, children }: FormSectionProps) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.space[3], marginBottom: theme.space[8] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
        <T variant="title2" accessibilityRole="header" style={{ flex: 1 }}>
          {title}
        </T>
        {right}
      </View>
      {children}
    </View>
  );
}
