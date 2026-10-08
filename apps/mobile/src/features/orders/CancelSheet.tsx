// Master: cancel an order. The reason is required (order_action cancel raises MISSING_REASON without it);
// the red button then asks once more through the confirm sheet (destructive actions, PHASE_0 §6.13).
import type { OrderView } from '@rota/shared';
import { useState } from 'react';
import { Keyboard, View } from 'react-native';

import { t } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { Button } from '@/ui/Button';
import { useConfirm } from '@/ui/ConfirmSheet';
import { TextField } from '@/ui/TextField';

import { OverlaySheet } from './OverlaySheet';

export interface CancelSheetProps {
  order: Pick<OrderView, 'number'>;
  pending: boolean;
  onCancel: (reason: string) => void;
  onClose: () => void;
}

export function CancelSheet({ order, pending, onCancel, onClose }: CancelSheetProps) {
  const theme = useTheme();
  const confirm = useConfirm();
  const [reason, setReason] = useState('');
  const text = reason.trim();

  const submit = async () => {
    if (!text) return;
    Keyboard.dismiss();
    const ok = await confirm({
      title: t('order.cancel.confirmTitle', { n: order.number }),
      message: text,
      confirmLabel: t('order.cancel.confirm'),
      cancelLabel: t('order.cancel.keep'),
      destructive: true,
    });
    if (ok) onCancel(text);
  };

  return (
    <OverlaySheet
      title={t('order.cancel.title', { n: order.number })}
      subtitle={t('order.cancel.subtitle')}
      onClose={onClose}
      testID="cancel-sheet"
    >
      <View style={{ paddingHorizontal: theme.size.gutter, gap: theme.space[4] }}>
        <TextField
          label={t('order.cancel.reason')}
          placeholder={t('order.cancel.placeholder')}
          value={reason}
          onChangeText={setReason}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={() => void submit()}
          maxLength={200}
        />
        <View style={{ gap: theme.space[2] }}>
          <Button
            label={t('order.cancel.confirm')}
            variant="danger"
            size="L"
            full
            loading={pending}
            disabled={!text}
            onPress={() => void submit()}
          />
          <Button label={t('order.cancel.keep')} variant="secondary" size="L" full onPress={onClose} />
        </View>
      </View>
    </OverlaySheet>
  );
}
