// The one Supabase client of the app (PHASE_1 §4). Publishable key only; the secret key never ships.
import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

export type ApiMode = 'mock' | 'supabase';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const apiMode: ApiMode =
  process.env.EXPO_PUBLIC_API_MODE === 'supabase' && url && key ? 'supabase' : 'mock';

export const demoAccounts = process.env.EXPO_PUBLIC_DEMO_ACCOUNTS !== 'false';

export const supabase: SupabaseClient | null =
  apiMode === 'supabase' && url && key
    ? createClient(url, key, {
        auth: {
          storage: AsyncStorage,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      })
    : null;

// Refresh tokens only while the app is in the foreground (supabase-js guidance for React Native).
if (supabase) {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
