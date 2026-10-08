// Loading and error states shared by the order and worker screens.
import type { MascotName } from '@rota/design';
import { ActivityIndicator, View } from 'react-native';

import { t } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';

import { errorText } from './useOrderAction';

export function LoadingView() {
  const theme = useTheme();
  return (
    <View
      accessibilityLabel={t('common.loading')}
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: theme.space[12] }}
    >
      <ActivityIndicator color={theme.color.textSecondary} />
    </View>
  );
}

export function ErrorView({
  title,
  error,
  onRetry,
  mascot = 'oops',
}: {
  title: string;
  /** Shown as the Russian error text under the title; omit for a title only state. */
  error?: unknown;
  onRetry?: () => void;
  mascot?: MascotName;
}) {
  return (
    <EmptyState
      mascot={mascot}
      title={title}
      {...(error !== undefined ? { body: errorText(error) } : {})}
      action={
        onRetry ? <Button label={t('common.retry')} variant="secondary" size="L" onPress={onRetry} /> : undefined
      }
    />
  );
}
