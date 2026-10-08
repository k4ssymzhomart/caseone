import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { GeistMono_400Regular, GeistMono_500Medium } from '@expo-google-fonts/geist-mono';
import { QueryClientProvider, useIsFetching } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LiveBridge, LiveHudProvider } from '@/features/live/LiveBridge';
import { NotificationBridge } from '@/features/notifications/NotificationBridge';
import { ApiProvider, useSession, useSessionReady } from '@/lib/api';
import { queryClient } from '@/lib/query';
import { ThemeProvider, useTheme } from '@/lib/theme';
import { ConfirmProvider } from '@/ui/ConfirmSheet';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

// Android form sheets have no native header and misbehave with flex content (PHASE_0 §6.9 Sheet): use modal there.
const sheet = Platform.OS === 'ios' ? ('formSheet' as const) : ('modal' as const);

/** A cold start with a session keeps the splash until the first fetches settle, but no longer than this. */
const SPLASH_CAP_MS = 3000;

/**
 * PHASE_2 §2.5: without a session the splash goes as soon as that is known; with one it stays until the role
 * screen's first queries have settled (capped), so the app opens on data instead of spinners. The pending
 * emergency check (NotificationBridge) runs once the role screen is up. Its own component: the fetch count
 * changes all the time and must not re-render the navigator.
 */
function SplashGate() {
  const ready = useSessionReady();
  const hasSession = useSession() !== null;
  const fetching = useIsFetching();
  const seen = useRef(false);
  const hidden = useRef(false);

  const hide = useCallback(() => {
    if (hidden.current) return;
    hidden.current = true;
    SplashScreen.hideAsync().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!hasSession) {
      hide();
      return;
    }
    const cap = setTimeout(hide, SPLASH_CAP_MS);
    return () => clearTimeout(cap);
  }, [ready, hasSession, hide]);

  useEffect(() => {
    if (!ready || !hasSession) return;
    if (fetching > 0) seen.current = true;
    else if (seen.current) hide();
  }, [ready, hasSession, fetching, hide]);

  return null;
}

function RootStack() {
  const theme = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.color.bgCanvas },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(worker)" />
      <Stack.Screen name="(master)" />
      <Stack.Screen name="(manager)" />
      <Stack.Screen name="order/[id]/index" />
      <Stack.Screen name="order/[id]/close" />
      <Stack.Screen name="order/[id]/review" />
      <Stack.Screen
        name="order/[id]/reason"
        options={{
          presentation: sheet,
          sheetAllowedDetents: 'fitToContents',
          sheetGrabberVisible: false,
          contentStyle: { backgroundColor: theme.color.bgElevated },
        }}
      />
      <Stack.Screen name="create" options={{ presentation: 'modal' }} />
      <Stack.Screen
        name="emergency/[id]"
        options={{
          presentation: 'fullScreenModal',
          gestureEnabled: false,
          animation: 'fade',
          contentStyle: { backgroundColor: theme.status.critical },
        }}
      />
      <Stack.Screen
        name="worker/[id]"
        options={{
          presentation: sheet,
          sheetAllowedDetents: [0.6, 1],
          sheetGrabberVisible: false,
          contentStyle: { backgroundColor: theme.color.bgElevated },
        }}
      />
      <Stack.Screen name="equipment/[id]" />
      <Stack.Screen name="demo" />
      <Stack.Screen name="kit" />
      <Stack.Screen name="admin" />
    </Stack>
  );
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    GeistMono_400Regular,
    GeistMono_500Medium,
  });

  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <QueryClientProvider client={queryClient}>
            <ApiProvider>
              <LiveHudProvider>
                <ConfirmProvider>
                  <SplashGate />
                  <LiveBridge />
                  <NotificationBridge />
                  <RootStack />
                </ConfirmProvider>
              </LiveHudProvider>
            </ApiProvider>
          </QueryClientProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
