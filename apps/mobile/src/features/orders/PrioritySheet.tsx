// Master: change the priority of an active order (order_action set_priority). Raising it to emergency
// sends the assignee the emergency push on the server side.
import { PRIORITIES_SORTED, PRIORITY_LABEL, type OrderView, type Priority } from '@rota/shared';
import { useState } from 'react';
import { View } from 'react-native';

import { t } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { ActionList } from '@/ui/ActionList';
import { Button } from '@/ui/Button';

import { OverlaySheet } from './OverlaySheet';

export interface PrioritySheetProps {
  order: Pick<OrderView, 'number' | 'priority'>;
  pending: boolean;
  onSave: (priority: Priority) => void;
  onClose: () => void;
}

export function PrioritySheet({ order, pending, onSave, onClose }: PrioritySheetProps) {
  const theme = useTheme();
  const [value, setValue] = useState<Priority>(order.priority);
  return (
    <OverlaySheet title={t('order.priority.title', { n: order.number })} onClose={onClose} testID="priority-sheet">
      <ActionList
        items={PRIORITIES_SORTED.map((p) => ({
          key: p,
          label: PRIORITY_LABEL[p],
          ...(p === 'emergency' ? { tone: 'critical' as const } : {}),
        }))}
        value={value}
        onSelect={(key) => setValue(key as Priority)}
      />
      <View style={{ paddingHorizontal: theme.size.gutter }}>
        <Button
          label={t('order.priority.save')}
          size="L"
          full
          loading={pending}
          disabled={value === order.priority}
          onPress={() => onSave(value)}
        />
      </View>
    </OverlaySheet>
  );
}
