// The RotaApi contract (api/contract.ts) against the live Supabase project, PHASE_1 §9:
//
//   RUN_SUPABASE=1 npx vitest run --project packages/shared src/api/supabase
//
// The URL and the publishable key come from .secrets/supabase.env (never printed). Every scenario signs in with
// the demo accounts and starts with demo_reset(), so it needs the whole database: until
// supabase/manual/rota_remaining.sql and the seeds have run, sign in answers invalid_credentials and the suite
// is skipped with that message instead of failing. Without RUN_SUPABASE=1 it is skipped as well.

import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, it } from 'vitest';
import { runContract } from '../contract';
import { memoryStorage } from '../RotaApi';
import { SupabaseApi } from './SupabaseApi';

const RUN = process.env.RUN_SUPABASE === '1';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');

/** KEY=value lines; values are never logged. */
function readEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    out[line.slice(0, eq).trim()] = line
      .slice(eq + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

const env = RUN ? readEnvFile(resolve(ROOT, '.secrets/supabase.env')) : {};
const url = env.SUPABASE_URL ?? '';
const key = env.SUPABASE_PUBLISHABLE_KEY ?? '';

function makeClient(): SupabaseClient {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

const NOT_SEEDED =
  'no accounts yet: run supabase/manual/rota_remaining.sql, then supabase/seed/01_people.sql and 02_history.sql';

/** null when the live database can run the scenarios, else why not. */
async function probe(): Promise<string | null> {
  if (!url || !key)
    return 'SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY missing in .secrets/supabase.env';
  const client = makeClient();
  try {
    const { error } = await client.auth.signInWithPassword({
      email: '1001@naryad.local',
      password: 'nr_1111_kz',
    });
    if (error)
      return error.code === 'invalid_credentials'
        ? NOT_SEEDED
        : `sign in failed: ${error.code ?? error.message}`;
    const { count, error: areasError } = await client
      .from('areas')
      .select('id', { count: 'exact', head: true });
    if (areasError) return `areas unreadable: ${areasError.code}`;
    if (count !== 4) return `areas: ${count ?? 0} rows instead of 4 (migration 06 not applied)`;
    return null;
  } catch (e) {
    return `no connection: ${(e as Error).message}`;
  } finally {
    await client.auth.signOut({ scope: 'local' }).catch(() => undefined);
  }
}

const skipReason = RUN ? await probe() : 'set RUN_SUPABASE=1 to run it against the live project';

if (skipReason) {
  if (RUN) console.warn(`[SupabaseApi contract] skipped: ${skipReason}`);
  describe.skip(`SupabaseApi contract (live): ${skipReason}`, () => {
    it('runs the RotaApi scenarios against the live project', () => undefined);
  });
} else {
  const apis: SupabaseApi[] = [];
  const clients: SupabaseClient[] = [];

  afterEach(async () => {
    for (const api of apis.splice(0)) api.dispose();
    for (const client of clients.splice(0)) {
      await client.removeAllChannels();
      await client.auth.signOut({ scope: 'local' }).catch(() => undefined);
    }
  });

  runContract(
    () => {
      const client = makeClient();
      clients.push(client);
      const api = new SupabaseApi({
        mode: 'supabase',
        client,
        storage: memoryStorage(),
        uuid: randomUUID,
      });
      apis.push(api);
      return api;
    },
    {
      name: 'SupabaseApi contract (live)',
      uuid: randomUUID,
      timeoutMs: 90_000,
      realtimeWarmupMs: 10_000,
    },
  );
}
