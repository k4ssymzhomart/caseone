// npx tsx tools/insights-fixtures.ts
// Refreshes the test fixtures of ai-insights (supabase/functions/ai-insights/fixtures/) from the live project:
// public.analytics_bundle and public.insight_cards for the 92 day history window and for «участок дробления за
// 30 дней», plus the areas. Read only: two RPCs and a select with the secret key from .secrets/supabase.env (never
// printed). The history holds synthetic people only (CLAUDE.md §19).

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { readSecrets } from './lib/env.ts';

const secrets = readSecrets('supabase');
const url = process.env.SUPABASE_URL || secrets.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || secrets.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error('SUPABASE_URL or SUPABASE_SECRET_KEY missing in .secrets/supabase.env');
  process.exit(1);
}
const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const dir = resolve(import.meta.dirname, '..', 'supabase/functions/ai-insights/fixtures');
mkdirSync(dir, { recursive: true });

/** The history: 92 local days ending at the local midnight of 2026-10-08 (generated on 2026-10-08). */
const WINDOWS = [
  {
    file: 'bundle-92d.json',
    from: '2026-07-07T19:00:00.000Z',
    to: '2026-10-07T19:00:00.000Z',
    filters: {},
  },
  {
    file: 'bundle-30d-area2.json',
    from: '2026-09-08T19:00:00.000Z',
    to: '2026-10-08T19:00:00.000Z',
    filters: { area_id: 2 },
  },
] as const;

for (const w of WINDOWS) {
  const args = { p_from: w.from, p_to: w.to, p_filters: w.filters };
  const bundle = await admin.rpc('analytics_bundle', args);
  if (bundle.error) throw new Error(`analytics_bundle: ${bundle.error.message}`);
  const rules = await admin.rpc('insight_cards', args);
  if (rules.error) throw new Error(`insight_cards: ${rules.error.message}`);
  const out = {
    from: w.from,
    to: w.to,
    filters: w.filters,
    bundle: bundle.data,
    rules: rules.data,
  };
  writeFileSync(resolve(dir, w.file), `${JSON.stringify(out, null, 1)}\n`);
  console.log(`ok ${w.file}: ${(rules.data as unknown[]).length} rules cards`);
}

const areas = await admin.from('areas').select('id, name').order('id');
if (areas.error) throw new Error(`areas: ${areas.error.message}`);
writeFileSync(resolve(dir, 'areas.json'), `${JSON.stringify(areas.data, null, 1)}\n`);
console.log(`ok areas.json: ${areas.data.length} areas`);
