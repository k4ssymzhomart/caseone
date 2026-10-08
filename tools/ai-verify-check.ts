// npx tsx tools/ai-verify-check.ts [--order <id>] [--no-photo]
// Live check of the deployed ai-verify Edge Function (CLAUDE.md §11) with the publishable key and user sessions,
// the way the apps call it. Free while the project runs the mock provider (no LLM_PROVIDER secret); with
// LLM_PROVIDER=anthropic the fresh check costs one Sonnet call (about 0.02 USD).
//  1. master 1001/1111 creates an unplanned order on equipment 20 (Насос НШ-32 маслостанции) for worker 2001
//  2. worker 2001/1234 goes on shift if needed, accepts, starts, uploads an «после» photo (a golden set PNG,
//     source camera) and completes it: works text, Г-01, the demo step 5 materials
//  3. worker calls ai-verify: prints verdict, score, model, needs_master_review
//  4. worker calls it again: the same review comes back (already_reviewed)
//  5. no credentials and the publishable key alone: 401; another worker (2002/1234): 403
//  6. when .secrets/supabase.env holds SUPABASE_SECRET_KEY: the watchdog path (secret key in apikey) gets the
//     same review
// --order <id> skips 1 and 2 and checks an order of 2001 that is already in ai_review (or reviewed).
// The created order stays in ai_review or rework; «Сбросить демо» removes it with every order made after the
// history load. Reads SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY from .secrets/supabase.env; never prints keys
// or tokens. Exit codes: 0 every check passed, 1 a check failed, 2 the worker already has an order in progress.

import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { accountEmail, accountPassword } from '@rota/shared';
import { readSecrets } from './lib/env.ts';

const EQUIPMENT_ID = 20;
const PHOTO = resolve(
  import.meta.dirname,
  '..',
  'supabase/functions/ai-verify/golden/photos/pump_clean_a.png',
);
const MATERIALS: readonly { name: string; qty: number }[] = [
  { name: 'Кольцо уплотнительное', qty: 2 },
  { name: 'Масло гидравлическое ВМГЗ', qty: 2 },
  { name: 'Ветошь', qty: 1 },
];

const args = process.argv.slice(2);
const orderArg = args.includes('--order') ? Number(args[args.indexOf('--order') + 1]) : null;
const withPhoto = !args.includes('--no-photo');

const secrets = readSecrets('supabase');
const url = process.env.SUPABASE_URL || secrets.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY || secrets.SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) {
  console.error('SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY missing in .secrets/supabase.env');
  process.exit(1);
}
const fnUrl = `${url}/functions/v1/ai-verify`;

let failed = false;
function check(ok: boolean, label: string, detail = ''): void {
  if (!ok) failed = true;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`);
}

async function timed<T>(label: string, run: () => Promise<T>): Promise<T> {
  const t0 = performance.now();
  const value = await run();
  console.log(`     ${label}: ${Math.round(performance.now() - t0)} ms`);
  return value;
}

interface Session {
  client: SupabaseClient;
  id: string;
  token: string;
}

async function signIn(tabNo: string, pin: string): Promise<Session> {
  const client = createClient(url!, key!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email: accountEmail(tabNo),
    password: accountPassword(pin),
  });
  if (error || !data.session)
    throw new Error(`sign in ${tabNo}: ${error?.message ?? 'no session'}`);
  return { client, id: data.session.user.id, token: data.session.access_token };
}

async function rpc<T>(s: Session, fn: string, params: Record<string, unknown>): Promise<T> {
  const { data, error } = await s.client.rpc(fn, params);
  if (error)
    throw new Error(`${fn}: ${error.message}${error.details ? ` (${error.details})` : ''}`);
  return data as T;
}

interface OrderRow {
  id: number;
  number: number;
  status: string;
  client_ref: string;
  started_at: string | null;
}

async function action(
  s: Session,
  orderId: number,
  name: string,
  payload: Record<string, unknown> = {},
): Promise<OrderRow> {
  return rpc<OrderRow>(s, 'order_action', {
    p_order_id: orderId,
    p_action: name,
    p_payload: payload,
    p_client_action_id: randomUUID(),
  });
}

interface VerifyCall {
  status: number;
  body: {
    review?: {
      id: number;
      attempt: number;
      verdict: string;
      score: number;
      score5: number;
      confidence: number | null;
      needs_master_review: boolean;
      model: string | null;
      latency_ms: number | null;
      checks?: { id: string; status: string; points: number; max: number; message_ru?: string }[];
    };
    already_reviewed?: boolean;
    rules_only?: boolean;
    error?: string;
  };
  ms: number;
}

async function callVerify(orderId: number, headers: Record<string, string>): Promise<VerifyCall> {
  const t0 = performance.now();
  const res = await fetch(fnUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ order_id: orderId, source: 'live-check' }),
  });
  const text = await res.text();
  let body: VerifyCall['body'] = {};
  try {
    body = JSON.parse(text) as VerifyCall['body'];
  } catch {
    body = { error: text.slice(0, 120) };
  }
  return { status: res.status, body, ms: Math.round(performance.now() - t0) };
}

const userHeaders = (s: Session): Record<string, string> => ({
  apikey: key!,
  authorization: `Bearer ${s.token}`,
});

/** Width and height from the PNG IHDR chunk. */
function pngSize(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

async function prepareOrder(master: Session, worker: Session): Promise<number> {
  const me = await worker.client.from('employees').select('on_shift').eq('id', worker.id).single();
  if (me.error) throw new Error(`employees: ${me.error.message}`);
  if (!(me.data as { on_shift: boolean }).on_shift) {
    await timed('set_on_shift 2001', () =>
      rpc(worker, 'set_on_shift', { p_employee_id: worker.id, p_on_shift: true }),
    );
  }
  const busy = await worker.client
    .from('orders')
    .select('number')
    .eq('assignee_id', worker.id)
    .eq('status', 'in_progress');
  if (busy.error) throw new Error(`orders: ${busy.error.message}`);
  if ((busy.data ?? []).length > 0) {
    const n = (busy.data as { number: number }[])[0]!.number;
    console.error(`2001 already has order №${n} in progress; finish it or pass --order <id>`);
    process.exit(2);
  }

  const mats = await worker.client
    .from('materials')
    .select('id, name')
    .in(
      'name',
      MATERIALS.map((m) => m.name),
    );
  if (mats.error) throw new Error(`materials: ${mats.error.message}`);
  const byName = new Map((mats.data as { id: number; name: string }[]).map((m) => [m.name, m.id]));
  const materials = MATERIALS.map((m) => {
    const id = byName.get(m.name);
    if (!id) throw new Error(`material not found: ${m.name}`);
    return { material_id: id, qty: m.qty };
  });

  const clientRef = randomUUID();
  const created = await timed('create_order (master 1001)', () =>
    rpc<OrderRow>(master, 'create_order', {
      p: {
        type: 'unplanned',
        priority: 'normal',
        description: 'Течь масла по фланцу насоса. Тестовый наряд проверки ИИ',
        equipment_id: EQUIPMENT_ID,
        assignee_id: worker.id,
        suggested_fault_code: 'Г-01',
        client_ref: clientRef,
      },
      p_client_action_id: randomUUID(),
    }),
  );
  console.log(`     order №${created.number} (id ${created.id}) status ${created.status}`);

  await timed('accept', () => action(worker, created.id, 'accept'));
  await timed('start', () => action(worker, created.id, 'start'));

  if (withPhoto) {
    const bytes = new Uint8Array(readFileSync(PHOTO));
    const path = `orders/${clientRef}/after/${randomUUID()}.png`;
    await timed('upload after photo', async () => {
      const up = await worker.client.storage
        .from('photos')
        .upload(path, bytes, { contentType: 'image/png', upsert: false });
      if (up.error) throw new Error(`storage upload: ${up.error.message}`);
    });
    const { width, height } = pngSize(bytes);
    await timed('attach_photo', () =>
      rpc(worker, 'attach_photo', {
        p: {
          client_ref: clientRef,
          kind: 'after',
          storage_path: path,
          source: 'camera',
          captured_at: new Date().toISOString(),
          sha256: createHash('sha256').update(bytes).digest('hex'),
          width,
          height,
          bytes: bytes.length,
        },
      }),
    );
  }

  const done = await timed('complete', () =>
    action(worker, created.id, 'complete', {
      works_done:
        'Заменил уплотнительные кольца фланца, долил масло ВМГЗ, протёр подтёки. Течи нет.',
      fault_code: 'Г-01',
      materials,
      comment: 'Проверено под давлением',
    }),
  );
  check(
    done.status === 'ai_review',
    'complete moves the order to ai_review',
    `status ${done.status}`,
  );
  return created.id;
}

function printReview(call: VerifyCall): void {
  const r = call.body.review;
  if (!r) return;
  console.log(
    `     review ${r.id} attempt ${r.attempt}: verdict ${r.verdict}, score ${r.score} (${r.score5} из 5), ` +
      `model ${r.model ?? 'none'}, confidence ${r.confidence ?? 'none'}, ` +
      `needs_master_review ${r.needs_master_review}, function latency ${r.latency_ms ?? 'none'} ms` +
      (call.body.rules_only ? ', rules only' : '') +
      (call.body.already_reviewed ? ', already_reviewed' : ''),
  );
  for (const c of r.checks ?? []) {
    const mark = c.status === 'pass' ? '✓' : c.status === 'warn' ? '!' : '✕';
    console.log(`       ${mark} ${c.id} ${c.points}/${c.max} ${c.message_ru ?? ''}`.trimEnd());
  }
}

try {
  const master = await timed('sign in 1001', () => signIn('1001', '1111'));
  const worker = await timed('sign in 2001', () => signIn('2001', '1234'));
  const orderId = orderArg ?? (await prepareOrder(master, worker));

  const first = await callVerify(orderId, userHeaders(worker));
  check(
    first.status === 200 && !!first.body.review,
    'ai-verify as the assignee 2001',
    `HTTP ${first.status} in ${first.ms} ms${first.body.error ? `, ${first.body.error}` : ''}`,
  );
  printReview(first);

  const second = await callVerify(orderId, userHeaders(worker));
  const same =
    second.status === 200 &&
    second.body.already_reviewed === true &&
    second.body.review?.id === first.body.review?.id &&
    second.body.review?.verdict === first.body.review?.verdict &&
    second.body.review?.score === first.body.review?.score;
  check(
    same,
    'second call returns the same review (idempotent)',
    `HTTP ${second.status} in ${second.ms} ms, review ${second.body.review?.id ?? 'none'}, already_reviewed ${second.body.already_reviewed ?? false}`,
  );

  const anon = await callVerify(orderId, {});
  check(anon.status === 401, 'no credentials: 401', `HTTP ${anon.status} in ${anon.ms} ms`);
  const pubOnly = await callVerify(orderId, { apikey: key });
  check(
    pubOnly.status === 401,
    'publishable key alone: 401',
    `HTTP ${pubOnly.status} in ${pubOnly.ms} ms`,
  );
  const other = await signIn('2002', '1234');
  const foreign = await callVerify(orderId, userHeaders(other));
  check(
    foreign.status === 403,
    'another worker 2002: 403',
    `HTTP ${foreign.status} in ${foreign.ms} ms`,
  );

  // the watchdog retry path (§9 item 5): the secret key in apikey, as pg_net sends it
  const secret = process.env.SUPABASE_SECRET_KEY || secrets.SUPABASE_SECRET_KEY;
  if (secret) {
    const service = await callVerify(orderId, { apikey: secret });
    check(
      service.status === 200 && service.body.review?.id === first.body.review?.id,
      'secret key (watchdog path): same review',
      `HTTP ${service.status} in ${service.ms} ms, already_reviewed ${service.body.already_reviewed ?? false}`,
    );
  }

  const after = await worker.client
    .from('orders')
    .select('number, status, final_verdict')
    .eq('id', orderId)
    .single();
  if (after.data) {
    const o = after.data as { number: number; status: string };
    console.log(`     order №${o.number} (id ${orderId}) is now ${o.status}`);
  }
} catch (e) {
  failed = true;
  console.error(`FAIL ${e instanceof Error ? e.message : String(e)}`);
}

process.exit(failed ? 1 : 0);
