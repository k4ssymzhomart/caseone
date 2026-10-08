// SupabaseApi lands in Phase 1 (docs/PHASE_1.md §5): the same RotaApi over PostgREST RPCs, views,
// Storage and Realtime, with the client injected by the app. Until then createApi('supabase') throws.

import { RotaError } from '../errors';
import type { CreateApiOptions, RotaApi } from '../RotaApi';

export function createSupabaseApi(_options: CreateApiOptions): RotaApi {
  throw new RotaError('UNKNOWN', { message: 'SupabaseApi not built yet' });
}
