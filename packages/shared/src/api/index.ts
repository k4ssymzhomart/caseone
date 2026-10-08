import { MockApi } from './mock';
import type { CreateApiOptions, RotaApi } from './RotaApi';
import { createSupabaseApi } from './supabase';

export * from './errors';
export * from './RotaApi';
export { MockApi, MOCK_MODEL, type InjectErrorOptions } from './mock';

/** 'mock' → MockApi on this device; 'supabase' → SupabaseApi over the injected client. */
export function createApi(options: CreateApiOptions): RotaApi {
  if (options.mode === 'supabase') return createSupabaseApi(options);
  return new MockApi(options);
}
