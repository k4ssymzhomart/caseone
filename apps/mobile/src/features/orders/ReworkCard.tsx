// «Нужно доработать»: why the order came back. A master's return shows the master's comment; an AI
// return shows the failed and warned checks of the latest review (fails first).
import type { AiCheck, OrderDetail } from '@rota/shared';
import { View } from 'react-native';

import { t } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { Card } from '@/ui/Card';
import { CheckRow } from '@/ui/CheckRow';
import { Mascot } from '@/ui/Mascot';
import { T } from '@/ui/T';

interface Reason {
  key: string;
  status: 'fail' | 'warn';
  title: string;
  message?: string;
}

export function reworkReasons(detail: Pick<OrderDetail, 'events' | 'reviews'>): { byMaster: boolean; reasons: Reason[] } {
  const back = [...detail.events].reverse().find((e) => e.to_status === 'rework');
  const review = detail.reviews[detail.reviews.length - 1];
  if (back?.action === 'return') {
    const comment = back.comment ?? review?.master_comment ?? null;
    return {
      byMaster: true,
      reasons: comment ? [{ key: 'master', status: 'fail', title: comment }] : [],
    };
  }
  const checks: AiCheck[] = review?.checks ?? [];
  const rank = (c: AiCheck) => (c.status === 'fail' ? 0 : 1);
  const reasons = checks
    .filter((c) => c.status === 'fail' || c.status === 'warn')
    .sort((a, b) => rank(a) - rank(b))
    .map<Reason>((c) => ({
      key: c.id,
      status: c.status === 'fail' ? 'fail' : 'warn',
      title: c.title || c.message_ru,
      ...(c.title && c.message_ru ? { message: c.message_ru } : {}),
    }));
  return { byMaster: false, reasons };
}

export function ReworkCard({ detail }: { detail: Pick<OrderDetail, 'events' | 'reviews'> }) {
  const theme = useTheme();
  const { byMaster, reasons } = reworkReasons(detail);
  return (
    <Card style={{ gap: theme.space[4] }} testID="rework-card">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[4] }}>
        <Mascot name="oops" size={96} />
        <View style={{ flex: 1, gap: theme.space[1] }}>
          <T variant="title2" accessibilityRole="header">
            {t('order.rework.title')}
          </T>
          <T variant="callout" tone="secondary">
            {byMaster ? t('order.rework.byMaster') : t('order.rework.byAi')}
          </T>
        </View>
      </View>
      {reasons.length > 0 ? (
        <View style={{ gap: theme.space[3] }}>
          {reasons.map((r) => (
            <CheckRow
              key={r.key}
              status={r.status}
              title={r.title}
              {...(r.message ? { message: r.message } : {})}
              statusLabel={t(r.status === 'fail' ? 'check.fail' : 'check.warn')}
            />
          ))}
        </View>
      ) : (
        <T variant="bodyL" tone="secondary">
          {t('order.rework.noReasons')}
        </T>
      )}
    </Card>
  );
}
