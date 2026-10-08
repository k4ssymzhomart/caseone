// «Смена»: the master's shift panel (PHASE_0 §7.1, PHASE_2 §2.3). Counters since the shift start, every worker
// grouped by state from v_worker_status (free, working, queue, off), and the brigades collapsed at the bottom.
import { WORKER_STATES, workerStateText, type WorkerState, type WorkerStatusView } from '@rota/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { brigadeCounts, groupHeader, shiftEyebrow, specialtyLine } from '@/features/master/format';
import { LoadError, Loading } from '@/features/master/QueryStates';
import { ShiftCounters } from '@/features/master/ShiftCounters';
import { useNow } from '@/features/master/useNow';
import { WorkerRow } from '@/features/master/WorkerRow';
import { useApi } from '@/lib/api';
import { useDirectories } from '@/lib/directories';
import { t } from '@/lib/i18n';
import { qk } from '@/lib/keys';
import { liveHub } from '@/lib/liveHub';
import { useTheme } from '@/lib/theme';
import { EmptyState } from '@/ui/EmptyState';
import { ListGroup } from '@/ui/ListGroup';
import { ListRow } from '@/ui/ListRow';
import { Screen } from '@/ui/Screen';
import { useTabBarHeight } from '@/ui/TabBar';

const GROUP_LABEL: Record<WorkerState, string> = {
  free: 'master.group.free',
  working: 'master.group.working',
  queue: 'master.group.queue',
  off: 'master.group.off',
};

export default function ShiftScreen() {
  const api = useApi();
  const theme = useTheme();
  const qc = useQueryClient();
  const tabBar = useTabBarHeight();
  const now = useNow();
  const dirs = useDirectories();
  const workers = useQuery({ queryKey: qk.workers, queryFn: () => api.workers.statuses() });
  const brigades = useQuery({ queryKey: qk.brigades, queryFn: () => api.workers.brigades() });
  const [refreshing, setRefreshing] = useState(false);
  const [showBrigades, setShowBrigades] = useState(false);

  const brigadeName = useMemo(() => {
    const m = new Map<number, string>();
    for (const b of dirs.data?.brigades ?? []) m.set(b.id, b.name);
    return m;
  }, [dirs.data]);

  const groups = useMemo(() => {
    const by = new Map<WorkerState, WorkerStatusView[]>(WORKER_STATES.map((s) => [s, []]));
    for (const w of workers.data ?? []) by.get(w.status)?.push(w);
    for (const list of by.values()) list.sort((a, b) => a.short_name.localeCompare(b.short_name));
    return WORKER_STATES.map((state) => ({ state, list: by.get(state) ?? [] })).filter((g) => g.list.length > 0);
  }, [workers.data]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    liveHub.resync();
    try {
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.workers }),
        qc.invalidateQueries({ queryKey: qk.brigades }),
        qc.invalidateQueries({ queryKey: qk.shift }),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [qc]);

  let body: ReactNode;
  if (workers.isPending) {
    body = <Loading />;
  } else if (workers.isError) {
    body = <LoadError error={workers.error} onRetry={() => void workers.refetch()} />;
  } else if (groups.length === 0) {
    body = <EmptyState mascot="peek" title={t('master.workers.empty')} body={t('master.workers.emptyBody')} />;
  } else {
    body = groups.map(({ state, list }) => (
      <ListGroup key={state} header={groupHeader(t(GROUP_LABEL[state]), list.length)}>
        {list.map((w) => (
          <WorkerRow
            key={w.id}
            name={w.short_name}
            subtitle={specialtyLine(w, w.brigade_id != null ? brigadeName.get(w.brigade_id) : null)}
            state={w.status}
            stateText={workerStateText(w)}
            detail={w.status === 'working' ? w.current_equipment_name : null}
            onPress={() => router.push(`/worker/${w.id}` as Href)}
            testID={`worker-${w.tab_no}`}
          />
        ))}
      </ListGroup>
    ));
  }

  const brigadeRows = brigades.data ?? [];

  return (
    <Screen
      title={t('master.shift.title')}
      eyebrow={shiftEyebrow(now)}
      insetBottom={false}
      bottomPadding={tabBar}
      refreshing={refreshing}
      onRefresh={() => void onRefresh()}
    >
      <View style={{ gap: theme.space[6] }}>
        <ShiftCounters
          now={now}
          onOverduePress={() => router.navigate(`/board?column=overdue&at=${Date.now()}` as Href)}
        />
        {body}
        {brigadeRows.length > 0 ? (
          <ListGroup>
            <ListRow
              title={t('master.brigades.title')}
              value={showBrigades ? t('master.brigades.hide') : t('master.brigades.show')}
              showChevron={false}
              onPress={() => setShowBrigades((v) => !v)}
              accessibilityLabel={t('master.brigades.title')}
            />
            {showBrigades
              ? brigadeRows.map((b) => (
                  <ListRow
                    key={b.id}
                    title={b.name}
                    subtitle={b.leader_short_name ? t('master.brigades.leader', { name: b.leader_short_name }) : undefined}
                    value={brigadeCounts(b)}
                  />
                ))
              : null}
          </ListGroup>
        ) : null}
      </View>
    </Screen>
  );
}
