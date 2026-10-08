// Providers outside the router: React Query, the RotaApi context, the HUD. Reads the stored session once.
import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import { api, ApiContext, startSession } from '@/lib/api';
import { queryClient } from '@/lib/query';
import { HudProvider } from './HudHost';

export function AppProviders({ children }: { children: ReactNode }) {
  useEffect(() => {
    startSession();
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <ApiContext.Provider value={api}>
        <HudProvider>{children}</HudProvider>
      </ApiContext.Provider>
    </QueryClientProvider>
  );
}
