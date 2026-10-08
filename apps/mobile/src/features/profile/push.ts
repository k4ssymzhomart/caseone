// Push token registration and the push status shown in the profile (CLAUDE.md §8, PHASE_0 §7.1).
// The token is upserted after sign in when permission is already granted, after the onboarding screen, and
// whenever the profile checks the status, so a phone shared by two people always carries the current person.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PushTokenInput, RotaApi } from '@rota/shared';
import * as Device from 'expo-device';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { api as appApi } from '@/lib/api';
import { getPushToken, permissionState, type PermissionState } from '@/lib/notifications';

/** Set once the person has seen the notification onboarding (either button). */
export const ONBOARDED_KEY = 'rota.onboarded';

/** getPushToken talks to Expo's servers; never let it hold a screen longer than this. */
const TOKEN_TIMEOUT_MS = 4000;

export function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

export function pushPlatform(): PushTokenInput['platform'] {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  return 'web';
}

/** The Expo push token or null, bounded in time. */
export function pushToken(): Promise<string | null> {
  return withTimeout(getPushToken(), TOKEN_TIMEOUT_MS, null);
}

/** Gets the token (permission must already be granted) and upserts it into push_tokens. Never throws. */
export async function registerPush(api: RotaApi = appApi): Promise<string | null> {
  const token = await pushToken();
  if (!token) return null;
  try {
    await api.notifications.registerPushToken({
      token,
      platform: pushPlatform(),
      device_name: Device.deviceName ?? null,
    });
  } catch {
    // The profile shows the status; the next check registers again.
  }
  return token;
}

export async function markOnboarded(): Promise<void> {
  await AsyncStorage.setItem(ONBOARDED_KEY, '1').catch(() => undefined);
}

/** True when the phone has never been asked for notification permission and onboarding was not shown yet. */
export async function needsOnboarding(): Promise<boolean> {
  const [state, done] = await Promise.all([
    permissionState().catch((): PermissionState => 'denied'),
    AsyncStorage.getItem(ONBOARDED_KEY).catch(() => null),
  ]);
  return state === 'undetermined' && !done;
}

/** checking → ready («Push включён»), notReady («Push пока не настроен»), denied («Уведомления выключены»). */
export type PushStatus = 'checking' | 'ready' | 'notReady' | 'denied';

export interface PushStatusState {
  status: PushStatus;
  permission: PermissionState | null;
  token: string | null;
  refresh: () => Promise<void>;
}

/** Push status for the profile. Rechecks on focus and when the app returns from the phone settings. */
export function usePushStatus(): PushStatusState {
  const [permission, setPermission] = useState<PermissionState | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    const state = await permissionState().catch((): PermissionState => 'denied');
    const tok = state === 'granted' ? await registerPush() : null;
    if (!alive.current) return;
    setPermission(state);
    setToken(tok);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const status: PushStatus =
    permission === null
      ? 'checking'
      : permission === 'denied'
        ? 'denied'
        : permission === 'granted' && token
          ? 'ready'
          : 'notReady';

  return { status, permission, token, refresh };
}

/** «ExponentPushToken[abcdefgh…wxyz]» shortened in the middle for one mono line. */
export function shortToken(token: string): string {
  return token.length <= 28 ? token : `${token.slice(0, 22)}…${token.slice(-5)}`;
}
