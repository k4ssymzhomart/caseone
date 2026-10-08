// The profile tab for worker, master and manager (PHASE_0 §7.1). The worker adds «На смене» and the rating;
// master and manager add links to the demo controls and the kit.
import type { Session } from '@rota/shared';
import { useQueryClient } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useSession } from '@/lib/api';
import { t } from '@/lib/i18n';
import { qk } from '@/lib/keys';
import { useTheme } from '@/lib/theme';
import { Avatar } from '@/ui/Avatar';
import { ListGroup } from '@/ui/ListGroup';
import { ListRow } from '@/ui/ListRow';
import { Screen } from '@/ui/Screen';
import { useTabBarHeight } from '@/ui/TabBar';

import { last30DaysFrom } from './period';
import {
  IdentityCard,
  NotificationsGroup,
  OnShiftGroup,
  roleLabel,
  SignOutGroup,
  TelegramGroup,
  ThemeGroup,
} from './ProfileSections';
import { RatingSection } from './RatingSection';

export type ProfileVariant = 'worker' | 'master' | 'manager';

const HOME: Record<ProfileVariant, string> = {
  worker: '/(worker)',
  master: '/(master)',
  manager: '/(manager)',
};

export function ProfileScreen({ variant }: { variant: ProfileVariant }) {
  // The session ends a moment after sign out has left this screen; render nothing in between.
  const session = useSession();
  if (!session) return null;
  return <ProfileContent session={session} variant={variant} />;
}

function ProfileContent({ session, variant }: { session: Session; variant: ProfileVariant }) {
  const theme = useTheme();
  const qc = useQueryClient();
  const tabBar = useTabBarHeight();
  const [from] = useState(() => last30DaysFrom());
  const [refreshing, setRefreshing] = useState(false);
  const worker = variant === 'worker';
  const density = worker ? 'worker' : 'master';

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        qc.refetchQueries({ queryKey: qk.workers }),
        // The rating itself, not its AI explanation (one LLM call per window).
        qc.refetchQueries({ queryKey: qk.rating(from, session.user_id), exact: true }),
      ]);
    } catch {
      // each section shows its own error
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Screen
      title={t('profile.title')}
      eyebrow={t('profile.eyebrow', { role: roleLabel(session.role), tab: session.tab_no })}
      right={<Avatar name={session.full_name} size={theme.size.tapMin} />}
      bottomPadding={tabBar}
      refreshing={refreshing}
      onRefresh={() => void onRefresh()}
    >
      <View style={{ gap: theme.space[6] }}>
        <IdentityCard session={session} />
        {worker ? <OnShiftGroup employeeId={session.user_id} /> : null}
        {worker ? <RatingSection employeeId={session.user_id} from={from} /> : null}
        <NotificationsGroup density={density} testUrl={HOME[variant]} />
        <TelegramGroup density={density} />
        <ThemeGroup />
        {worker ? null : (
          <ListGroup header={t('profile.tools')}>
            {variant === 'master' ? (
              <ListRow
                title={t('profile.demo')}
                subtitle={t('profile.demoHint')}
                onPress={() => router.push('/demo' as Href)}
              />
            ) : null}
            <ListRow title={t('profile.kit')} onPress={() => router.push('/kit' as Href)} />
          </ListGroup>
        )}
        <SignOutGroup density={density} />
      </View>
    </Screen>
  );
}
