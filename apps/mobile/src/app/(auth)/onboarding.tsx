// Notification permission onboarding after the first sign in on a phone (CLAUDE.md §8, PHASE_0 §7.1).
// «Включить» asks for permission, then registers the Expo push token; «Позже» skips. Both remember the visit.
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { markOnboarded, registerPush } from '@/features/profile/push';
import { StepDots } from '@/features/profile/StepDots';
import { useApi } from '@/lib/api';
import { t } from '@/lib/i18n';
import { requestPermission } from '@/lib/notifications';
import { useTheme } from '@/lib/theme';
import { Button } from '@/ui/Button';
import { useHud } from '@/ui/Hud';
import { Mascot } from '@/ui/Mascot';
import { Screen } from '@/ui/Screen';
import { T } from '@/ui/T';

export default function Onboarding() {
  const theme = useTheme();
  const api = useApi();
  const hud = useHud();
  const [busy, setBusy] = useState<'enable' | 'later' | null>(null);

  // After sign in this screen replaced the login, so it goes home; opened from the profile it goes back there.
  const finish = async () => {
    await markOnboarded();
    if (router.canGoBack()) router.back();
    else router.replace('/' as Href);
  };

  const enable = async () => {
    if (busy) return;
    setBusy('enable');
    try {
      const state = await requestPermission();
      if (state === 'granted') await registerPush(api);
      else hud.show({ message: t('onboarding.denied') });
    } catch {
      hud.show({ message: t('onboarding.denied') });
    }
    await finish();
  };

  const later = async () => {
    if (busy) return;
    setBusy('later');
    await finish();
  };

  return (
    <Screen
      scroll={false}
      footer={
        <>
          <Button
            label={t('onboarding.enable')}
            size="L"
            full
            onPress={() => void enable()}
            loading={busy === 'enable'}
            disabled={busy !== null && busy !== 'enable'}
          />
          <Button
            label={t('onboarding.later')}
            variant="ghost"
            size="L"
            full
            onPress={() => void later()}
            disabled={busy !== null}
          />
          <View style={{ paddingTop: theme.space[2] }}>
            <StepDots count={2} active={1} />
          </View>
        </>
      }
    >
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          gap: theme.space[4],
          paddingHorizontal: theme.space[4],
        }}
      >
        <Mascot name="mail" size={160} />
        <T variant="title1" align="center" accessibilityRole="header">
          {t('onboarding.title')}
        </T>
        <T variant="bodyL" tone="secondary" align="center">
          {t('onboarding.body')}
        </T>
      </View>
    </Screen>
  );
}
