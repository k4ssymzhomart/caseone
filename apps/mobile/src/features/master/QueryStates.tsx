// Loading and error states for the master screens' queries.
import { ActivityIndicator, View } from 'react-native';

import { errorText } from '@/features/orders/useOrderAction';
import { t } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';

/** A centered spinner with room around it. */
export function Loading({ compact = false }: { compact?: boolean }) {
  const theme = useTheme();
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={t('common.loading')}
      style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: compact ? theme.space[6] : theme.space[16] }}
    >
      <ActivityIndicator color={theme.color.textSecondary} />
    </View>
  );
}

/** Mascot `oops`, the Russian error text and «Повторить». */
export function LoadError({
  error,
  onRetry,
  compact = false,
}: {
  error: unknown;
  onRetry: () => void;
  compact?: boolean;
}) {
  return (
    <EmptyState
      mascot="oops"
      mascotSize={compact ? 96 : 140}
      title={t('master.loadError')}
      body={errorText(error)}
      action={<Button label={t('common.retry')} variant="secondary" onPress={onRetry} />}
    />
  );
}
