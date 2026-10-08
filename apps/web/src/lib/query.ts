import { QueryClient } from '@tanstack/react-query';

// Live sync invalidates what changed (lib/live.ts) and the tab coming back resyncs everything, so focus refetch is off.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5_000, retry: 1, refetchOnWindowFocus: false, refetchOnReconnect: true },
    mutations: { retry: 0 },
  },
});
