// «Демо» for master and admin (CLAUDE.md §20, PHASE_0 §7.1, PHASE_2 §2.3): demo mode and the ×10 time scale
// through settings, «Сбросить демо» (demo_reset, then resync), and local test notifications.
import { ACTIVE_STATUSES, type Directories, type Settings } from '@rota/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, router, type Href } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { errorText, showErrorHud } from '@/features/orders/useOrderAction';
import { useApi, useSession } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { t } from '@/lib/i18n';
import { qk } from '@/lib/keys';
import { liveHub } from '@/lib/liveHub';
import { permissionState, sendTestNotification } from '@/lib/notifications';
import { useTheme } from '@/lib/theme';
import { Banner } from '@/ui/Banner';
import { Button } from '@/ui/Button';
import { useConfirm } from '@/ui/ConfirmSheet';
import { useHud } from '@/ui/Hud';
import { ListGroup } from '@/ui/ListGroup';
import { ListRow } from '@/ui/ListRow';
import { Screen } from '@/ui/Screen';
import { Switch } from '@/ui/Switch';

type SettingKey = 'demo_mode' | 'demo_time_scale';
type TestKind = 'order' | 'emergency';

export default function Demo() {
  const session = useSession();
  if (!session) return null;
  if (session.role !== 'master' && session.role !== 'admin') return <Redirect href={'/' as Href} />;
  return <DemoContent />;
}

function DemoContent() {
  const theme = useTheme();
  const api = useApi();
  const qc = useQueryClient();
  const hud = useHud();
  const confirm = useConfirm();
  const settings = useQuery({ queryKey: qk.settings, queryFn: () => api.demo.settings() });
  const [saving, setSaving] = useState<SettingKey | null>(null);
  const [optimistic, setOptimistic] = useState<Partial<Settings>>({});
  const [resetting, setResetting] = useState(false);
  const [testing, setTesting] = useState<TestKind | null>(null);

  const demoMode = optimistic.demo_mode ?? settings.data?.demo_mode ?? false;
  const fast = (optimistic.demo_time_scale ?? settings.data?.demo_time_scale ?? 1) > 1;
  const ready = settings.isSuccess;

  const save = async (key: SettingKey, patch: Partial<Settings>) => {
    if (saving) return;
    setSaving(key);
    setOptimistic(patch);
    try {
      const next = await api.demo.updateSettings(patch);
      qc.setQueryData(qk.settings, next);
      // The create screen may read demo_mode from the cached directories: keep them in step.
      qc.setQueryData<Directories>(qk.directories, (d) => (d ? { ...d, settings: next } : d));
    } catch (e) {
      showErrorHud(hud, e, () => void save(key, patch), t('demo.saveError'));
    } finally {
      setSaving(null);
      setOptimistic({});
    }
  };

  const reset = async () => {
    if (resetting) return;
    const ok = await confirm({
      title: t('demo.resetTitle'),
      message: t('demo.resetBody'),
      confirmLabel: t('demo.resetConfirm'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (!ok) return;
    await runReset();
  };

  /** demo_reset is idempotent, so the NETWORK retry simply runs it again (no second confirm). */
  const runReset = async () => {
    setResetting(true);
    try {
      await api.demo.reset();
      liveHub.resync();
      await qc.invalidateQueries();
      void haptic.success();
      hud.show({ message: t('demo.resetDone') });
    } catch (e) {
      showErrorHud(hud, e, () => void runReset());
    } finally {
      setResetting(false);
    }
  };

  /** An active order to open from the test notification; any order otherwise; №1 when the list fails. */
  const sampleOrderId = async (): Promise<number> => {
    try {
      const [active] = await api.orders.list({ statuses: [...ACTIVE_STATUSES], limit: 1 });
      if (active) return active.id;
      const [any] = await api.orders.list({ limit: 1 });
      if (any) return any.id;
    } catch {
      // the fallback below still opens a screen
    }
    return 1;
  };

  const test = async (kind: TestKind) => {
    if (testing) return;
    setTesting(kind);
    try {
      const state = await permissionState();
      if (state !== 'granted') {
        hud.show({
          message: t('notif.pushDenied'),
          tone: 'critical',
          ...(state === 'undetermined'
            ? {
                actionLabel: t('onboarding.enable'),
                onAction: () => router.push('/(auth)/onboarding' as Href),
              }
            : {}),
        });
        return;
      }
      // The emergency test opens the sample red screen (№148, the push's own text) with its siren: a real
      // order that is no longer «Выдан» would give way to its card at once.
      const url = kind === 'emergency' ? '/emergency/demo' : `/order/${await sampleOrderId()}`;
      await sendTestNotification(kind, url);
      hud.show({ message: t('profile.testSent') });
    } catch (e) {
      hud.show({ message: errorText(e), tone: 'critical' });
    } finally {
      setTesting(null);
    }
  };

  return (
    <Screen
      title={t('demo.title')}
      eyebrow={t('demo.eyebrow')}
      right={
        router.canGoBack() ? (
          <Button label={t('common.close')} variant="secondary" size="S" onPress={() => router.back()} />
        ) : undefined
      }
      footer={
        <Button
          label={t('demo.reset')}
          variant="danger"
          size="L"
          full
          loading={resetting}
          onPress={() => void reset()}
        />
      }
    >
      <View style={{ gap: theme.space[6] }}>
        {settings.isError ? (
          <Banner
            tone="critical"
            text={t('demo.settingsError')}
            actionLabel={t('common.retry')}
            onAction={() => void settings.refetch()}
          />
        ) : null}

        <ListGroup header={t('demo.settings')} footer={t('demo.resetHint')}>
          <ListRow
            title={t('demo.mode')}
            subtitle={t('demo.modeHint')}
            right={
              <Switch
                value={demoMode}
                onValueChange={(v) => void save('demo_mode', { demo_mode: v })}
                disabled={!ready || saving !== null}
                accessibilityLabel={t('demo.mode')}
              />
            }
          />
          <ListRow
            title={t('demo.scale')}
            subtitle={t('demo.scaleHint')}
            right={
              <Switch
                value={fast}
                onValueChange={(v) => void save('demo_time_scale', { demo_time_scale: v ? 10 : 1 })}
                disabled={!ready || saving !== null}
                accessibilityLabel={t('demo.scale')}
              />
            }
          />
        </ListGroup>

        <ListGroup header={t('demo.tests')} footer={t('demo.testsFooter')}>
          <ListRow
            title={t('demo.testOrder')}
            onPress={() => void test('order')}
            disabled={testing !== null}
          />
          <ListRow
            title={t('demo.testEmergency')}
            onPress={() => void test('emergency')}
            disabled={testing !== null}
          />
        </ListGroup>

        <ListGroup>
          <ListRow title={t('demo.ai')} subtitle={t('demo.aiHint')} />
        </ListGroup>
      </View>
    </Screen>
  );
}
