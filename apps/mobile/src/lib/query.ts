import { isRotaError } from '@rota/shared';
import { focusManager, QueryClient } from '@tanstack/react-query';
import { AppState, Platform } from 'react-native';

/** One retry, except for an answer that a retry cannot change (a row that is not there or not mine). */
function retryOnce(failureCount: number, error: unknown): boolean {
  if (isRotaError(error) && error.code === 'BAD_INPUT') return false;
  return failureCount < 1;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5_000, retry: retryOnce, refetchOnReconnect: true },
    mutations: { retry: 0 },
  },
});

// React Query's focus refetch for React Native: the app coming back to the foreground counts as focus.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => focusManager.setFocused(state === 'active'));
}
