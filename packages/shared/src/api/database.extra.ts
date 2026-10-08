// Hand written extension of database.types.ts: the pieces of the migrations that are not applied on the live
// database yet, so the generator cannot see them (PHASE_1 §2). As of 2026-10-08 the live project lacks
// internal.apply_action, internal.generate_history and internal.demo_reset (internal schema, not exposed to the
// apps) and public.telegram_link_token() (migration 20261008100013_rota_dispatch.sql), which is added here.
// Once supabase/manual/rota_remaining.sql has run, regenerate database.types.ts; an entry here that the generator
// now emits can then be deleted (the intersection below stays correct either way).

import type { Database as GeneratedDatabase } from './database.types';

/** public functions defined in the migrations but missing from the generated types. */
export interface ExtraPublicFunctions {
  /** One time token for t.me/<bot>?start=<token>, valid 15 minutes (migration 13). */
  telegram_link_token: { Args: never; Returns: string };
}

type GeneratedPublic = GeneratedDatabase['public'];
type GeneratedFunctions = GeneratedPublic['Functions'];

/** Generated functions plus the extra ones, as one flat object type (an intersection breaks postgrest-js typing). */
type RotaFunctions = {
  [F in keyof GeneratedFunctions | keyof ExtraPublicFunctions]: F extends keyof ExtraPublicFunctions
    ? ExtraPublicFunctions[F]
    : F extends keyof GeneratedFunctions
      ? GeneratedFunctions[F]
      : never;
};

/** The database schema the apps talk to: the generated types with ExtraPublicFunctions merged in. */
export type RotaDatabase = {
  [K in keyof GeneratedDatabase]: K extends 'public'
    ? { [P in keyof GeneratedPublic]: P extends 'Functions' ? RotaFunctions : GeneratedPublic[P] }
    : GeneratedDatabase[K];
};

/** Names of every callable public function. */
export type RpcName = keyof RotaDatabase['public']['Functions'];
