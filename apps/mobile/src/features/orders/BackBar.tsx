// «‹ Назад» above the title of stack screens without a native header (glove sized target).
import { router, type Href } from 'expo-router';

import { t } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { Button } from '@/ui/Button';

/** Back when there is history (a pushed screen), otherwise home: a cold start from a notification has none. */
export function goBack(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/' as Href);
}

export function BackBar({ onBack = goBack }: { onBack?: () => void }) {
  const theme = useTheme();
  return (
    <Button
      label={t('common.back')}
      left="‹"
      variant="ghost"
      size="M"
      onPress={onBack}
      // The ghost pill has 20 px padding; pull it back so the glyph lines up with the gutter.
      style={{ marginLeft: -theme.space[5], marginBottom: theme.space[2] }}
      testID="back"
    />
  );
}
