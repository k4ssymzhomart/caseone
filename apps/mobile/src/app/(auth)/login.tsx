// Login (CLAUDE.md §18, PHASE_0 §7.1, PHASE_2 §2.3): табельный номер, then a 4 digit ПИН on the keypad.
// WRONG_PIN shakes the dots with the error haptic; NETWORK offers a retry with the same digits.
import type { MascotName } from '@rota/design';
import { isRotaError } from '@rota/shared';
import { router, type Href } from 'expo-router';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { errorText } from '@/features/orders/useOrderAction';
import { needsOnboarding, registerPush } from '@/features/profile/push';
import { pendingSignOut } from '@/features/profile/signOut';
import { TabSlots } from '@/features/profile/TabSlots';
import { signIn, useApi } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { t } from '@/lib/i18n';
import { demoAccounts } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import { Banner } from '@/ui/Banner';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { Keypad } from '@/ui/Keypad';
import { Lockup } from '@/ui/Lockup';
import { Mascot } from '@/ui/Mascot';
import { PinDots } from '@/ui/PinDots';
import { Screen } from '@/ui/Screen';
import { T } from '@/ui/T';

const LENGTH = 4;

/** Demo accounts of the Demo Day script (CLAUDE.md §19, §23). */
const DEMO = [
  { label: 'login.demo.master', tab: '1001', pin: '1111' },
  { label: 'login.demo.ahmetov', tab: '2001', pin: '1234' },
  { label: 'login.demo.ivanov', tab: '2002', pin: '1234' },
  { label: 'login.demo.manager', tab: '3001', pin: '3333' },
] as const;

type Step = 'tab' | 'pin';
type Problem = { kind: 'wrong' | 'network' | 'other'; text: string } | null;

export default function Login() {
  const theme = useTheme();
  const api = useApi();
  const [step, setStep] = useState<Step>('tab');
  const [tab, setTabState] = useState('');
  const [pin, setPinState] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem>(null);
  const [errorKey, setErrorKey] = useState(0);
  // Mirrors of the digits so fast taps between renders never drop or double a digit.
  const tabRef = useRef('');
  const pinRef = useRef('');
  const busyRef = useRef(false);

  const setTab = (v: string) => {
    tabRef.current = v;
    setTabState(v);
  };
  const setPin = (v: string) => {
    pinRef.current = v;
    setPinState(v);
  };

  const submit = useCallback(
    async (tabNo: string, pinCode: string) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      setProblem(null);
      try {
        await pendingSignOut();
        await signIn(tabNo, pinCode);
        const onboard = await needsOnboarding();
        if (!onboard) void registerPush(api);
        router.replace((onboard ? '/(auth)/onboarding' : '/') as Href);
      } catch (e) {
        if (isRotaError(e) && e.code === 'WRONG_PIN') {
          // PinDots plays the error haptic and the shake when errorKey changes.
          pinRef.current = '';
          setPinState('');
          setErrorKey((k) => k + 1);
          setProblem({ kind: 'wrong', text: e.message });
        } else if (isRotaError(e) && e.code === 'NETWORK') {
          void haptic.warning();
          setProblem({ kind: 'network', text: e.message });
        } else {
          void haptic.error();
          setProblem({ kind: 'other', text: errorText(e) });
        }
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [api],
  );

  const onDigit = (d: string) => {
    if (busyRef.current) return;
    if (problem) setProblem(null);
    if (step === 'tab') {
      if (tabRef.current.length < LENGTH) setTab(tabRef.current + d);
      return;
    }
    if (pinRef.current.length >= LENGTH) return;
    const next = pinRef.current + d;
    setPin(next);
    // The fourth digit signs in by itself: one tap less in gloves. «Войти» does the same.
    if (next.length === LENGTH) void submit(tabRef.current, next);
  };

  const onErase = () => {
    if (busyRef.current) return;
    if (problem?.kind !== 'network') setProblem(null);
    if (step === 'tab') {
      setTab(tabRef.current.slice(0, -1));
      return;
    }
    if (pinRef.current.length === 0) {
      setStep('tab');
      return;
    }
    setPin(pinRef.current.slice(0, -1));
  };

  const onNext = () => {
    if (busyRef.current) return;
    if (step === 'tab') {
      if (tabRef.current.length === LENGTH) {
        setProblem(null);
        setStep('pin');
      }
      return;
    }
    if (pinRef.current.length === LENGTH) void submit(tabRef.current, pinRef.current);
  };

  const changeTab = () => {
    if (busyRef.current) return;
    setPin('');
    setProblem(null);
    setStep('tab');
  };

  const demo = (account: (typeof DEMO)[number]) => {
    if (busyRef.current) return;
    setTab(account.tab);
    setPin(account.pin);
    setStep('pin');
    void submit(account.tab, account.pin);
  };

  const digits = step === 'tab' ? tab : pin;
  const mascot: MascotName = problem ? 'oops' : step === 'pin' ? 'key' : 'wave';
  const nextDisabled = busy || digits.length < LENGTH;

  let hint: ReactNode;
  if (problem?.kind === 'network') {
    hint = (
      <Banner
        tone="critical"
        text={problem.text}
        actionLabel={t('common.retry')}
        onAction={() => void submit(tabRef.current, pinRef.current)}
      />
    );
  } else if (problem) {
    hint = (
      <T variant="callout" tone="critical" align="center" accessibilityLiveRegion="assertive">
        {problem.text}
      </T>
    );
  } else if (busy) {
    hint = (
      <T variant="callout" tone="secondary" align="center">
        {t('login.signingIn')}
      </T>
    );
  } else {
    hint = (
      <T variant="callout" tone="secondary" align="center">
        {step === 'tab' ? t('login.tabHint') : t('login.pinHint', { tab })}
      </T>
    );
  }

  return (
    <Screen avoidKeyboard={false}>
      <View style={{ flex: 1, gap: theme.space[4] }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            minHeight: theme.size.buttonS,
          }}
        >
          <Lockup height={24} accessibilityLabel={t('app.name')} />
          {step === 'pin' ? (
            <Button
              label={t('login.changeTab')}
              variant="ghost"
              size="S"
              left="‹"
              onPress={changeTab}
              disabled={busy}
            />
          ) : null}
        </View>

        <View style={{ alignItems: 'center', gap: theme.space[2] }}>
          <Mascot name={mascot} size={88} />
          <T variant="title1" align="center" accessibilityRole="header">
            {step === 'tab' ? t('login.tabTitle') : t('login.pinTitle')}
          </T>
        </View>

        <View style={{ minHeight: theme.size.tapMin, justifyContent: 'center' }}>
          {step === 'tab' ? (
            <TabSlots value={tab} accessibilityLabel={t('login.tabSlots', { n: tab.length })} />
          ) : (
            <PinDots
              filled={pin.length}
              errorKey={errorKey}
              accessibilityLabel={t('login.pinDots', { n: pin.length })}
            />
          )}
        </View>

        <View style={{ minHeight: theme.size.tapMin, justifyContent: 'center' }}>{hint}</View>

        <View style={{ flex: 1 }} />

        <Keypad
          onDigit={onDigit}
          onErase={onErase}
          onNext={onNext}
          eraseLabel={t('common.erase')}
          nextLabel={step === 'tab' ? t('common.next') : t('login.signIn')}
          nextDisabled={nextDisabled}
          eraseDisabled={busy || (step === 'tab' && tab.length === 0)}
        />

        {demoAccounts ? (
          <View style={{ gap: theme.space[2] }}>
            <T variant="monoCaps" tone="secondary" align="center">
              {t('login.demo')}
            </T>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              style={{ marginHorizontal: -theme.size.gutter }}
              contentContainerStyle={{ gap: theme.space[2], paddingHorizontal: theme.size.gutter }}
            >
              {DEMO.map((a) => (
                <Chip key={a.tab} label={t(a.label)} onPress={() => demo(a)} disabled={busy} />
              ))}
            </ScrollView>
          </View>
        ) : null}

        <T variant="footnote" tone="secondary" align="center">
          {t('app.slogan')}
        </T>
      </View>
    </Screen>
  );
}
