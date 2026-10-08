// A titled stack of order cards for the worker lists: «Аварийные 1», «В работе 2», «Очередь 3».
import type { OrderView } from '@rota/shared';
import { router, type Href } from 'expo-router';
import { View } from 'react-native';

import { useTheme } from '@/lib/theme';
import { OrderCard } from '@/ui/OrderCard';
import { T } from '@/ui/T';

import { orderCardProps, type Viewer } from './present';

export interface OrderSectionProps {
  title?: string;
  orders: readonly OrderView[];
  now: Date;
  viewer: Viewer;
  /** Critical title for «Аварийные». */
  critical?: boolean;
  testID?: string;
}

export function OrderSection({ title, orders, now, viewer, critical, testID }: OrderSectionProps) {
  const theme = useTheme();
  if (orders.length === 0) return null;
  return (
    <View style={{ gap: theme.space[3] }} testID={testID}>
      {title ? (
        <View
          accessible
          accessibilityRole="header"
          accessibilityLabel={`${title}, ${orders.length}`}
          style={{ flexDirection: 'row', alignItems: 'baseline', gap: theme.space[2] }}
        >
          <T variant="title2" tone={critical ? 'critical' : 'primary'}>
            {title}
          </T>
          <T variant="monoL" tone="secondary">
            {String(orders.length)}
          </T>
        </View>
      ) : null}
      {orders.map((o) => (
        <OrderCard
          key={o.id}
          {...orderCardProps(o, { viewer, now, onPress: () => router.push(`/order/${o.id}` as Href) })}
          testID={`order-card-${o.number}`}
        />
      ))}
    </View>
  );
}
