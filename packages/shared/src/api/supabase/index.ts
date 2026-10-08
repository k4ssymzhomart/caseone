// SupabaseApi (PHASE_1 §5): the same RotaApi over PostgREST views and RPCs, Storage and Realtime, with the client
// created and owned by the app (PHASE_1 §4). createApi({ mode: 'supabase', client, storage, uuid }) builds it.

import type { CreateApiOptions, RotaApi } from '../RotaApi';
import { SupabaseApi } from './SupabaseApi';

export { SupabaseApi, downtimeMinutes, foldSettings, validateSettingsPatch } from './SupabaseApi';
export { fromAuth, fromPostgrest, fromStorage, fromThrown } from './errors';

export function createSupabaseApi(options: CreateApiOptions): RotaApi {
  return new SupabaseApi(options);
}
