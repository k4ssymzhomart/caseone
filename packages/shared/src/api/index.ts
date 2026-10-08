import { MockApi } from './mock';
import type { CreateApiOptions, RotaApi } from './RotaApi';
import { createSupabaseApi } from './supabase';

export * from './errors';
export * from './RotaApi';
export { MockApi, MOCK_MODEL, type InjectErrorOptions } from './mock';
export { SupabaseApi } from './supabase';
export type { Database, Json } from './database.types';
export type { ExtraPublicFunctions, RotaDatabase, RpcName } from './database.extra';

/**
 * 'mock' → MockApi on this device; 'supabase' → SupabaseApi over `options.client` (required), a client the app
 * created with the publishable key (PHASE_1 §4).
 */
export function createApi(options: CreateApiOptions): RotaApi {
  if (options.mode === 'supabase') return createSupabaseApi(options);
  return new MockApi(options);
}
