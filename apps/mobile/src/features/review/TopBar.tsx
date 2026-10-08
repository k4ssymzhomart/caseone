// Back row for the stack screens of this area (the root stack hides native headers).
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { t } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { Button } from '@/ui/Button';
import { Eyebrow } from '@/ui/Eyebrow';
import { T, type TextTone } from '@/ui/T';

export function useGoBack(): () => void {
  const router = useRouter();
  return () => (router.canGoBack() ? router.back() : router.replace('/'));
}

export interface TopBarProps {
  /** Eyebrow above the title, «№147 · ВНЕПЛАНОВЫЙ». */
  eyebrow?: string;
  eyebrowTone?: TextTone;
  title?: string;
  /** Headline line under the title: the equipment. */
  subtitle?: string;
  /** Callout secondary line: area, assignee. */
  caption?: string;
  onBack?: () => void;
}

/** «‹ Назад», then eyebrow, title1, headline and caption. */
export function TopBar({ eyebrow, eyebrowTone, title, subtitle, caption, onBack }: TopBarProps) {
  const theme = useTheme();
  const goBack = useGoBack();
  return (
    <View style={{ marginBottom: theme.space[6] }}>
      <View style={{ marginLeft: -theme.space[4], marginBottom: theme.space[2] }}>
        <Button variant="ghost" size="S" left="‹" label={t('common.back')} onPress={onBack ?? goBack} />
      </View>
      <View style={{ gap: theme.space[1] }}>
        {eyebrow ? <Eyebrow tone={eyebrowTone ?? 'secondary'}>{eyebrow}</Eyebrow> : null}
        {title ? (
          <T variant="title1" accessibilityRole="header">
            {title}
          </T>
        ) : null}
        {subtitle ? <T variant="headline">{subtitle}</T> : null}
        {caption ? (
          <T variant="callout" tone="secondary">
            {caption}
          </T>
        ) : null}
      </View>
    </View>
  );
}
