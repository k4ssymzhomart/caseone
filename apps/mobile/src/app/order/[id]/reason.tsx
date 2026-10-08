// Reject or pause reason (PHASE_0 §7.1): a form sheet on iOS, a modal on Android. ?type=reject|pause.
// Reasons come from @rota/shared reasons.ts; «Другое» opens a text area that must be filled before confirming.
// Natural height content (no flex 1): the iOS sheet fits to it and Android form sheets break with flex.
import { PAUSE_REASONS, REJECT_REASONS, rejectNeedsComment, type RejectReason } from '@rota/shared';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { goBack } from '@/features/orders/BackBar';
import { useOrderAction } from '@/features/orders/useOrderAction';
import { useApi } from '@/lib/api';
import { t } from '@/lib/i18n';
import { qk } from '@/lib/keys';
import { useTheme } from '@/lib/theme';
import { ActionList } from '@/ui/ActionList';
import { Button } from '@/ui/Button';
import { SheetHeader } from '@/ui/SheetHeader';
import { TextArea } from '@/ui/TextArea';

const COMMENT_MAX = 300;

export default function ReasonSheet() {
  const theme = useTheme();
  const api = useApi();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string; type?: string }>();
  const kind: 'reject' | 'pause' = params.type === 'pause' ? 'pause' : 'reject';
  const orderId = Number(params.id);
  const valid = Number.isInteger(orderId) && orderId > 0;

  // Usually already cached by the order or emergency screen underneath.
  const order = useQuery({
    queryKey: qk.order(orderId),
    queryFn: () => api.orders.get(orderId),
    enabled: valid,
  }).data?.order;

  const { run, pending } = useOrderAction();
  const [reason, setReason] = useState<string | null>(null);
  const [comment, setComment] = useState('');

  const options = kind === 'reject' ? REJECT_REASONS : PAUSE_REASONS;
  const other = reason === 'other';
  const text = comment.trim();
  // «Другое» needs a few words for both kinds (PHASE_2 §2.3): «Пауза: Другое» alone tells the master nothing.
  const required =
    reason !== null && (kind === 'reject' ? rejectNeedsComment(reason as RejectReason) : reason === 'other');
  const canSubmit = valid && reason !== null && (!required || text.length > 0);

  const submit = async () => {
    if (!canSubmit || reason === null) return;
    const done = await run(
      orderId,
      kind,
      { reason, ...(other && text ? { comment: text } : {}) },
      {
        success: t(kind === 'reject' ? 'order.hud.rejected' : 'order.hud.paused'),
        ...(order ? { number: order.number } : {}),
      },
    );
    if (done) goBack();
  };

  return (
    <View style={{ paddingBottom: insets.bottom + theme.space[4], backgroundColor: theme.color.bgElevated }}>
      <SheetHeader
        title={t(kind === 'reject' ? 'order.reason.rejectTitle' : 'order.reason.pauseTitle')}
        {...(order ? { subtitle: `№${order.number} · ${order.equipment_name}` } : {})}
        closeLabel={t('order.reason.close')}
        onClose={goBack}
        showHandle={Platform.OS === 'ios'}
      />
      <View style={{ marginTop: theme.space[2] }}>
        <ActionList
          items={options.map((o) => ({ key: o.value, label: o.label }))}
          value={reason}
          onSelect={setReason}
        />
      </View>
      <View style={{ paddingHorizontal: theme.size.gutter, gap: theme.space[4], marginTop: theme.space[4] }}>
        {other ? (
          <TextArea
            label={t(required ? 'order.reason.otherLabel' : 'order.reason.commentLabel')}
            placeholder={t(required ? 'order.reason.otherPlaceholder' : 'order.reason.commentPlaceholder')}
            value={comment}
            onChangeText={setComment}
            maxLength={COMMENT_MAX}
            inputStyle={{ fontSize: theme.type.bodyL.fontSize, lineHeight: theme.type.bodyL.lineHeight }}
            autoFocus
          />
        ) : null}
        <Button
          label={t(kind === 'reject' ? 'order.reason.confirmReject' : 'order.reason.confirmPause')}
          variant={kind === 'reject' ? 'danger' : 'primary'}
          size="L"
          full
          loading={pending === kind}
          disabled={!canSubmit}
          onPress={() => void submit()}
          testID="reason-confirm"
        />
      </View>
    </View>
  );
}
