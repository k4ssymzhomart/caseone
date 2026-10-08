// Shared pieces of the profile screens: identity, «На смене», connection, push status, Telegram, theme, sign out.
import type { LiveStatus, Session } from '@rota/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Linking, View } from 'react-native';

import { errorText, showErrorHud } from '@/features/orders/useOrderAction';
import { useApi } from '@/lib/api';
import { useDirectories } from '@/lib/directories';
import { t } from '@/lib/i18n';
import { qk } from '@/lib/keys';
import { useLiveStatus } from '@/lib/liveHub';
import { sendTestNotification } from '@/lib/notifications';
import { useTheme, useThemePreference, type ThemePreference } from '@/lib/theme';
import { Card } from '@/ui/Card';
import { useHud } from '@/ui/Hud';
import { ListGroup } from '@/ui/ListGroup';
import { ListRow, type ListRowDensity } from '@/ui/ListRow';
import { Pill, type PillTone } from '@/ui/Pill';
import { Segmented, type SegmentedItem } from '@/ui/Segmented';
import { Switch } from '@/ui/Switch';
import { T } from '@/ui/T';

import { shortToken, usePushStatus, type PushStatus } from './push';
import { useSignOut } from './signOut';

const capitalize = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

export function roleLabel(role: Session['role']): string {
  return t(`profile.role.${role}`);
}

/** Full name, then specialty and grade, brigade or shift, from the cached directories. */
export function IdentityCard({ session }: { session: Session }) {
  const theme = useTheme();
  const dirs = useDirectories();
  const me = dirs.data?.employees.find((e) => e.id === session.user_id);
  const brigade =
    me?.brigade_id != null ? dirs.data?.brigades.find((b) => b.id === me.brigade_id) : undefined;

  const parts: string[] = [];
  if (me?.specialty) {
    parts.push(
      me.grade != null
        ? t('profile.grade', { specialty: capitalize(me.specialty), grade: me.grade })
        : capitalize(me.specialty),
    );
  }
  if (brigade) parts.push(brigade.name);
  else if (me?.shift) parts.push(t(`profile.shift.${me.shift}`));

  return (
    <Card>
      <View style={{ gap: theme.space[1] }}>
        <T variant="title2">{session.full_name}</T>
        {parts.length > 0 ? (
          <T variant="callout" tone="secondary">
            {parts.join(' · ')}
          </T>
        ) : null}
      </View>
    </Card>
  );
}

/** «На смене» for the worker: v_worker_status row, optimistic while the call runs. */
export function OnShiftGroup({ employeeId }: { employeeId: string }) {
  const api = useApi();
  const hud = useHud();
  const qc = useQueryClient();
  const dirs = useDirectories();
  const workers = useQuery({ queryKey: qk.workers, queryFn: () => api.workers.statuses() });
  const [optimistic, setOptimistic] = useState<boolean | null>(null);

  const row = workers.data?.find((w) => w.id === employeeId);
  const fallback = dirs.data?.employees.find((e) => e.id === employeeId)?.on_shift ?? false;
  const onShift = optimistic ?? row?.on_shift ?? fallback;

  const toggle = async (next: boolean) => {
    if (optimistic !== null) return;
    setOptimistic(next);
    try {
      await api.workers.setOnShift(employeeId, next);
      await qc.invalidateQueries({ queryKey: qk.workers });
    } catch (e) {
      showErrorHud(hud, e, () => void toggle(next), t('profile.onShiftError'));
    } finally {
      setOptimistic(null);
    }
  };

  return (
    <ListGroup>
      <ListRow
        density="worker"
        title={t('profile.onShift')}
        subtitle={t(onShift ? 'profile.onShiftOn' : 'profile.onShiftOff')}
        right={
          <Switch
            value={onShift}
            onValueChange={(v) => void toggle(v)}
            disabled={optimistic !== null}
            accessibilityLabel={t('profile.onShift')}
          />
        }
      />
    </ListGroup>
  );
}

const LIVE_PILL: Record<LiveStatus, { label: string; tone: PillTone }> = {
  live: { label: 'profile.connection.live', tone: 'success' },
  connecting: { label: 'profile.connection.connecting', tone: 'warning' },
  offline: { label: 'profile.connection.offline', tone: 'critical' },
};

/** The live channel's state (PHASE_2 §2.1): «На связи», «Подключение…» or «Нет связи», a dot plus a word. */
export function ConnectionGroup({ density }: { density: ListRowDensity }) {
  const status = useLiveStatus((s) => s.status);
  const pill = LIVE_PILL[status];
  return (
    <ListGroup>
      <ListRow
        density={density}
        title={t('profile.connection')}
        right={<Pill label={t(pill.label)} tone={pill.tone} />}
        testID="profile-connection"
      />
    </ListGroup>
  );
}

const PUSH_PILL: Record<Exclude<PushStatus, 'checking'>, { label: string; tone: PillTone }> = {
  ready: { label: 'notif.pushReady', tone: 'success' },
  notReady: { label: 'notif.pushNotReady', tone: 'warning' },
  denied: { label: 'notif.pushDenied', tone: 'critical' },
};

/** Push status pill, the token, the test notification, and a way to turn notifications on. */
export function NotificationsGroup({ density, testUrl }: { density: ListRowDensity; testUrl: string }) {
  const hud = useHud();
  const push = usePushStatus();
  const [sending, setSending] = useState(false);
  const pill = push.status === 'checking' ? null : PUSH_PILL[push.status];

  const test = async () => {
    setSending(true);
    try {
      await sendTestNotification('order', testUrl);
      hud.show({ message: t('profile.testSent') });
    } catch (e) {
      hud.show({ message: errorText(e), tone: 'critical' });
    } finally {
      setSending(false);
    }
  };

  return (
    <ListGroup header={t('profile.notifications')}>
      <ListRow
        density={density}
        title={t('profile.push')}
        value={pill ? undefined : t('profile.pushChecking')}
        right={pill ? <Pill label={t(pill.label)} tone={pill.tone} /> : undefined}
      />
      {push.token ? (
        <ListRow density={density} title={t('profile.token')} value={shortToken(push.token)} mono />
      ) : null}
      {push.permission === 'granted' ? (
        <ListRow
          density={density}
          title={t('profile.test')}
          onPress={() => void test()}
          disabled={sending}
        />
      ) : null}
      {push.permission === 'undetermined' ? (
        <ListRow
          density={density}
          title={t('profile.enable')}
          onPress={() => router.push('/(auth)/onboarding' as Href)}
        />
      ) : null}
      {push.permission === 'denied' ? (
        <ListRow
          density={density}
          title={t('profile.openSettings')}
          onPress={() => void Linking.openSettings().catch(() => undefined)}
        />
      ) : null}
    </ListGroup>
  );
}

/** Telegram arrives in Phase 3: the row is visible and disabled. */
export function TelegramGroup({ density }: { density: ListRowDensity }) {
  return (
    <ListGroup footer={t('profile.telegramSoon')}>
      <ListRow density={density} title={t('profile.telegram')} disabled />
    </ListGroup>
  );
}

const THEME_ITEMS: readonly SegmentedItem<ThemePreference>[] = [
  { key: 'dark', label: 'profile.theme.dark' },
  { key: 'light', label: 'profile.theme.light' },
  { key: 'system', label: 'profile.theme.system' },
];

export function ThemeGroup() {
  const theme = useTheme();
  const [preference, setPreference] = useThemePreference();
  const items = THEME_ITEMS.map((i) => ({ ...i, label: t(i.label) }));
  return (
    <View style={{ gap: theme.space[2] }}>
      <T
        variant="monoCaps"
        tone="secondary"
        accessibilityRole="header"
        style={{ paddingHorizontal: theme.space[4] }}
      >
        {t('profile.theme')}
      </T>
      <Segmented
        items={items}
        value={preference}
        onChange={setPreference}
        accessibilityLabel={t('profile.theme')}
      />
    </View>
  );
}

export function SignOutGroup({ density }: { density: ListRowDensity }) {
  const { busy, run } = useSignOut();
  return (
    <ListGroup>
      <ListRow
        density={density}
        title={t('profile.signOut')}
        destructive
        showChevron={false}
        disabled={busy}
        onPress={() => void run()}
      />
    </ListGroup>
  );
}
