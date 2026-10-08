// The emergency screen (CLAUDE.md §8, PHASE_0 §7.1): full screen red, siren and heavy haptics until the
// worker answers. «Принять» accepts and opens the order; «Отклонить» opens the reject reasons. It never
// dismisses by itself; once the order is no longer «Выдан» (accepted on another phone, reassigned, rejected)
// it gives way to the order screen; once it is not mine any more (reassigned away: RLS hides it) it closes.
// The id `demo` (test notification) shows sample text and only closes.
// Android's back button does nothing here: the worker answers with «Принять» or «Отклонить».
import { primitives, withAlpha } from '@rota/design';
import { hhmm, type Status } from '@rota/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef } from 'react';
import { BackHandler, Image, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { registerEmergencyScreen } from '@/features/notifications/emergencyGate';
import { goBack } from '@/features/orders/BackBar';
import { isOrderGone, useOrderAction } from '@/features/orders/useOrderAction';
import { useApi, useSession } from '@/lib/api';
import { t } from '@/lib/i18n';
import { qk } from '@/lib/keys';
import { startSiren, stopSiren } from '@/lib/siren';
import { useTheme } from '@/lib/theme';
import { Button } from '@/ui/Button';
import { Eyebrow } from '@/ui/Eyebrow';
import { T } from '@/ui/T';

/** White text on red; secondary lines at 80 %. */
const WHITE = primitives.white;
const WHITE_SOFT = withAlpha(primitives.white, 0.8);
const PHOTO_ASPECT = 4 / 3;

export default function EmergencyScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const session = useSession();
  const demo = params.id === 'demo';
  if (!demo && !session) return <Redirect href={'/' as Href} />;
  return <EmergencyBody idParam={params.id} demo={demo} />;
}

function EmergencyBody({ idParam, demo }: { idParam: string; demo: boolean }) {
  const theme = useTheme();
  const api = useApi();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const orderId = Number(idParam);
  const valid = !demo && Number.isInteger(orderId) && orderId > 0;

  const query = useQuery({
    queryKey: qk.order(orderId),
    queryFn: () => api.orders.get(orderId),
    enabled: valid,
  });
  const order = query.data?.order;
  const before = query.data?.photos.find((p) => p.kind === 'before');
  const photoPaths = before ? [before.storage_path] : [];
  const photo = useQuery({
    queryKey: qk.photoUrls(photoPaths),
    queryFn: () => api.photos.urls(photoPaths),
    enabled: photoPaths.length > 0,
    staleTime: 30 * 60_000,
  });
  const photoUri = before ? photo.data?.[before.storage_path] : undefined;

  const { run, pending } = useOrderAction();

  // Siren bookkeeping. startSiren is async (audio mode first), so a stop that lands while it starts is
  // checked again when it resolves: each arm gets a token and any later silence invalidates it.
  const focused = useRef(false);
  const leaving = useRef(false);
  const accepted = useRef(false);
  const sirenToken = useRef(0);
  /** Only a «not found» from a fetch made while this screen is up counts (an old cached one may be outdated). */
  const mountedAt = useRef(Date.now());
  const status = useRef<Status | null>(null);
  status.current = order?.status ?? null;

  const silence = useCallback(() => {
    sirenToken.current += 1;
    stopSiren();
  }, []);

  const arm = useCallback(() => {
    const token = ++sirenToken.current;
    void startSiren().then(() => {
      if (token !== sirenToken.current || !focused.current || leaving.current) stopSiren();
    });
  }, []);

  /**
   * Not «Выдан» any more: stop and show the order. Not mine any more (reassigned, or gone in a demo reset): the
   * refetch fails with «order not found» while the cache keeps the old «Выдан», so stop and close. Only while
   * this screen is on top (a sheet may cover it). The query state is read from the client, not from the last
   * render, so a failed «Принять» (FORBIDDEN, then a refetch) is seen right after it returns.
   */
  const leaveIfAnswered = useCallback(() => {
    if (demo || !focused.current || leaving.current) return;
    const state = qc.getQueryState(qk.order(orderId));
    if (state?.status === 'error' && state.errorUpdatedAt >= mountedAt.current && isOrderGone(state.error)) {
      leaving.current = true;
      silence();
      goBack();
      return;
    }
    const s = status.current;
    if (s && s !== 'issued') {
      leaving.current = true;
      silence();
      router.replace(`/order/${orderId}` as Href);
    }
  }, [demo, orderId, qc, silence]);

  // The notification openers skip an order whose red screen is already up (no second copy after an unlock).
  useEffect(() => registerEmergencyScreen(idParam), [idParam]);

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      leaveIfAnswered();
      if (!leaving.current && !accepted.current) arm();
      // Never dismissed by the Android back button: it needs an answer. The load error state has «Закрыть».
      const back = BackHandler.addEventListener('hardwareBackPress', () => true);
      return () => {
        focused.current = false;
        back.remove();
        silence();
      };
    }, [arm, leaveIfAnswered, silence]),
  );

  useEffect(() => {
    leaveIfAnswered();
  }, [order?.status, query.error, leaveIfAnswered]);

  const accept = async () => {
    silence();
    if (!valid) {
      goBack();
      return;
    }
    accepted.current = true;
    const done = await run(orderId, 'accept', {}, {
      success: t('order.hud.accepted'),
      ...(order ? { number: order.number } : {}),
      strongHaptic: true,
    });
    if (!done) {
      // Still unanswered (network, declined retry): the siren sounds again until the worker answers.
      accepted.current = false;
      if (focused.current && !leaving.current) {
        leaveIfAnswered();
        if (!leaving.current) arm();
      }
      return;
    }
    if (!leaving.current) {
      leaving.current = true;
      router.replace(`/order/${orderId}` as Href);
    }
  };

  const reject = () => {
    silence();
    if (!valid) {
      goBack();
      return;
    }
    // The sheet covers this screen; coming back without a reject arms the siren again.
    router.push(`/order/${orderId}/reason?type=reject` as Href);
  };

  const number = order ? String(order.number) : demo ? t('order.emergency.demoNumber') : null;
  const due = order ? hhmm(order.due_at) : demo ? t('order.emergency.demoTime') : null;
  const equipment = order?.equipment_name ?? (demo ? t('order.emergency.demoEquipment') : null);
  const area = order?.area_name ?? (demo ? t('order.emergency.demoArea') : null);
  const description = order?.description ?? (demo ? t('order.emergency.demoDescription') : null);
  const failed = valid && query.isError && !order;

  return (
    <View style={{ flex: 1, backgroundColor: theme.status.critical }} testID="emergency-screen">
      <StatusBar style="light" />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: insets.top + theme.space[8],
          paddingHorizontal: theme.size.gutter,
          paddingBottom: theme.space[6],
          gap: theme.space[6],
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ gap: theme.space[2] }}>
          {number && due ? (
            <Eyebrow color={WHITE_SOFT}>{t('order.emergency.eyebrow', { n: number, time: due })}</Eyebrow>
          ) : null}
          <T variant="title1" color={WHITE} accessibilityRole="header">
            {t('order.emergency.title')}
          </T>
        </View>

        {equipment ? (
          <View style={{ gap: theme.space[2] }}>
            <T variant="title2" color={WHITE}>
              {equipment}
            </T>
            {area ? (
              <T variant="bodyL" color={WHITE_SOFT}>
                {area}
              </T>
            ) : null}
            {description ? (
              <T variant="bodyL" color={WHITE} style={{ marginTop: theme.space[2] }}>
                {description}
              </T>
            ) : null}
          </View>
        ) : (
          <T variant="bodyL" color={WHITE_SOFT}>
            {failed ? t('order.detail.loadError') : t('order.emergency.loading')}
          </T>
        )}
        {photoUri ? (
          <Image
            source={{ uri: photoUri }}
            style={{
              width: '100%',
              aspectRatio: PHOTO_ASPECT,
              borderRadius: theme.radius.lg,
              backgroundColor: theme.color.bgMuted,
            }}
            resizeMode="cover"
            accessibilityIgnoresInvertColors
          />
        ) : null}
      </ScrollView>

      <View
        style={{
          gap: theme.space[2],
          paddingHorizontal: theme.size.gutter,
          paddingTop: theme.space[4],
          paddingBottom: insets.bottom + theme.space[4],
        }}
      >
        <Button
          label={t('order.emergency.accept')}
          variant="onDanger"
          size="L"
          full
          loading={pending === 'accept'}
          onPress={() => void accept()}
          testID="emergency-accept"
        />
        <Button
          label={t('order.emergency.reject')}
          variant="ghostOnDanger"
          size="L"
          full
          disabled={pending !== null}
          onPress={reject}
          testID="emergency-reject"
        />
        {failed ? (
          <Button
            label={t('common.close')}
            variant="ghostOnDanger"
            size="L"
            full
            onPress={() => {
              silence();
              goBack();
            }}
          />
        ) : null}
      </View>
    </View>
  );
}
