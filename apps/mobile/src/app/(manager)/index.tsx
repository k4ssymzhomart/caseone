// «Сводка» for the руководитель (PHASE_0 §7.1, PHASE_2 §2.3): dashboard tiles for the last 30 days, the top 5
// problem units and the best workers. Full analytics live in the web panel.
import { formatDuration, formatNumber, plural, type Dashboard } from '@rota/shared';
import { useQuery } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { last30DaysFrom, periodFrom } from '@/features/profile/period';
import { useApi } from '@/lib/api';
import { t } from '@/lib/i18n';
import { qk } from '@/lib/keys';
import { liveHub } from '@/lib/liveHub';
import { useTheme } from '@/lib/theme';
import { Avatar } from '@/ui/Avatar';
import { Banner } from '@/ui/Banner';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Counter } from '@/ui/Counter';
import { EmptyState } from '@/ui/EmptyState';
import { ListGroup } from '@/ui/ListGroup';
import { ListRow } from '@/ui/ListRow';
import { Screen } from '@/ui/Screen';
import { useTabBarHeight } from '@/ui/TabBar';
import { T } from '@/ui/T';

const minutes = (v: number | null) => (v === null ? t('manager.noValue') : formatDuration(v));

const UNPLANNED_KEYS = ['manager.unplanned.one', 'manager.unplanned.few', 'manager.unplanned.many'] as const;

/** «1 внеплановая остановка», «3 внеплановые остановки», «7 внеплановых остановок». */
function unplannedText(n: number): string {
  return t(plural(n, UNPLANNED_KEYS), { n });
}

export default function ManagerSummary() {
  const theme = useTheme();
  const api = useApi();
  const tabBar = useTabBarHeight();
  const [from] = useState(() => last30DaysFrom());
  const dashboard = useQuery({
    queryKey: qk.dashboard(from),
    queryFn: () => api.reports.dashboard(periodFrom(from)),
  });
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    liveHub.resync();
    try {
      await dashboard.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  let content: ReactNode;
  if (dashboard.isPending) {
    content = (
      <T variant="body" tone="secondary">
        {t('common.loading')}
      </T>
    );
  } else if (dashboard.isError) {
    content = (
      <EmptyState
        mascot="dizzy"
        title={t('manager.error')}
        body={t('manager.errorBody')}
        action={
          <Button
            label={t('common.retry')}
            variant="secondary"
            onPress={() => void dashboard.refetch()}
          />
        }
      />
    );
  } else {
    content = <SummaryBody data={dashboard.data} />;
  }

  return (
    <Screen
      title={t('manager.title')}
      eyebrow={t('manager.eyebrow')}
      bottomPadding={tabBar}
      refreshing={refreshing}
      onRefresh={() => void onRefresh()}
    >
      <View style={{ gap: theme.space[6] }}>
        {content}
        <Banner tone="info" text={t('manager.webNote')} />
      </View>
    </Screen>
  );
}

function SummaryBody({ data }: { data: Dashboard }) {
  const theme = useTheme();
  const tiles = [
    { key: 'inProgress', value: String(data.in_progress_now), label: t('manager.inProgress') },
    {
      key: 'overdue',
      value: String(data.overdue_now),
      label: t('manager.overdue'),
      bad: data.overdue_now > 0,
    },
    { key: 'reaction', value: minutes(data.reaction_avg_min), label: t('manager.reaction') },
    { key: 'execution', value: minutes(data.execution_avg_min), label: t('manager.execution') },
    {
      key: 'downtime',
      value: t('manager.hours', { n: formatNumber(data.downtime_hours) }),
      label: t('manager.downtime'),
      bad: data.downtime_hours > 0,
    },
  ];
  const top = data.top_equipment.slice(0, 5);
  const best = data.best_workers.slice(0, 3);

  return (
    <View style={{ gap: theme.space[6] }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[3] }}>
        {tiles.map((tile) => (
          <Card key={tile.key} style={{ flexGrow: 1, flexBasis: '45%' }}>
            <Counter value={tile.value} label={tile.label} bad={tile.bad} />
          </Card>
        ))}
      </View>

      <ListGroup header={t('manager.topEquipment')}>
        {top.length === 0 ? (
          <ListRow title={t('manager.noEquipment')} />
        ) : (
          top.map((u, i) => (
            <ListRow
              key={u.equipment_id}
              left={
                <T variant="monoM" tone="secondary">
                  {String(i + 1)}
                </T>
              }
              title={u.name}
              subtitle={`${unplannedText(u.unplanned)} · ${t('manager.unitDowntime', { h: formatNumber(u.downtime_h) })}`}
              onPress={() => router.push(`/equipment/${u.equipment_id}` as Href)}
            />
          ))
        )}
      </ListGroup>

      {best.length > 0 ? (
        <ListGroup header={t('manager.bestWorkers')}>
          {best.map((w) => (
            <ListRow
              key={w.employee_id}
              left={<Avatar name={w.short_name} backdropColor={theme.color.bgSubtle} />}
              title={w.short_name}
              subtitle={t('manager.closed', { n: w.closed })}
              value={String(Math.round(w.score))}
              mono
            />
          ))}
        </ListGroup>
      ) : null}
    </View>
  );
}
