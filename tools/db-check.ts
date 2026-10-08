// npx tsx tools/db-check.ts
// Checks the live database the way the apps see it (PHASE_1 §9): signs in as master 1001/1111 through
// SupabaseApi with the publishable key only, prints the row counts of areas (4), equipment (25), employees (19)
// and orders (about 560), and the title of the first insight card for the last 92 days.
// Reads SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY from .secrets/supabase.env (never printed).
// Exit codes: 0 ok, 1 a check failed or no connection, 2 no accounts yet (the database is not seeded).

import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { isRotaError, memoryStorage, SupabaseApi } from '@rota/shared';
import { readSecrets } from './lib/env.ts';

const DAY = 86_400_000;
const NOT_SEEDED =
  'Run supabase/manual/rota_remaining.sql, then supabase/seed/01_people.sql and 02_history.sql';

const secrets = readSecrets('supabase');
const url = process.env.SUPABASE_URL || secrets.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY || secrets.SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) {
  console.error('SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY missing in .secrets/supabase.env');
  process.exit(1);
}

const client = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const api = new SupabaseApi({
  mode: 'supabase',
  client,
  storage: memoryStorage(),
  uuid: randomUUID,
});

type Table = 'areas' | 'equipment' | 'employees' | 'orders';
/** Rows each table must hold; null = any number above zero. */
const EXPECTED: Record<Table, number | null> = {
  areas: 4,
  equipment: 25,
  employees: 19,
  orders: null,
};

async function count(table: Table): Promise<number> {
  const { count: n, error } = await client.from(table).select('*', { count: 'exact', head: true });
  if (error) throw new Error(`${table}: ${error.code} ${error.message}`);
  return n ?? 0;
}

let failed = false;
try {
  try {
    const s = await api.auth.signIn('1001', '1111');
    console.log(`signed in: ${s.tab_no} ${s.short_name} (${s.role})`);
  } catch (e) {
    if (isRotaError(e) && e.code === 'WRONG_PIN') {
      console.error('sign in 1001/1111: invalid_credentials, the accounts are not there yet');
      console.error(NOT_SEEDED);
      process.exit(2);
    }
    throw e;
  }

  for (const table of Object.keys(EXPECTED) as Table[]) {
    const want = EXPECTED[table];
    const n = await count(table);
    const ok = want == null ? n > 0 : n === want;
    if (!ok) failed = true;
    const note = want == null ? '(about 560 after the seed)' : `(expected ${want})`;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${table.padEnd(10)} ${String(n).padStart(4)} ${note}`);
  }

  const to = new Date();
  const from = new Date(to.getTime() - 92 * DAY);
  const cards = await api.ai.insights({ from: from.toISOString(), to: to.toISOString() });
  const first = cards[0];
  if (first) {
    console.log(`ok   insight    ${cards.length} cards for 92 days, first: ${first.title}`);
  } else {
    failed = true;
    console.log('FAIL insight    no insight cards for 92 days');
  }
  await api.auth.signOut();
} catch (e) {
  failed = true;
  const code = isRotaError(e) ? `${e.code}: ` : '';
  console.error(`error: ${code}${(e as Error).message}`);
} finally {
  api.dispose();
}
process.exit(failed ? 1 : 0);
