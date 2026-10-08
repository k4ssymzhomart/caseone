import { describe, expect, it } from 'vitest';
import {
  bearerToken,
  callerFromHeaders,
  decideUserAccess,
  safeEqual,
  secretKeyCandidates,
} from './auth.ts';

const SECRET = 'sb_secret_test_value_0123456789';
const LEGACY = 'eyJhbGciOiJIUzI1NiJ9.service.sig';
const PUBLISHABLE = 'sb_publishable_test_value';

const envOf =
  (vars: Record<string, string>) =>
  (key: string): string | undefined =>
    vars[key];

describe('secret key candidates', () => {
  it('reads every key of SUPABASE_SECRET_KEYS, default first, then the legacy keys', () => {
    const keys = secretKeyCandidates(
      envOf({
        SUPABASE_SECRET_KEYS: JSON.stringify({ other: 'sb_secret_other', default: SECRET }),
        SUPABASE_SERVICE_ROLE_KEY: LEGACY,
      }),
    );
    expect(keys).toEqual([SECRET, 'sb_secret_other', LEGACY]);
  });

  it('survives a malformed SUPABASE_SECRET_KEYS and drops empty values', () => {
    expect(
      secretKeyCandidates(
        envOf({
          SUPABASE_SECRET_KEYS: '{oops',
          SUPABASE_SERVICE_ROLE_KEY: LEGACY,
          SUPABASE_SECRET_KEY: '',
        }),
      ),
    ).toEqual([LEGACY]);
    expect(secretKeyCandidates(envOf({}))).toEqual([]);
  });
});

describe('caller from headers', () => {
  const secrets = [SECRET, LEGACY];
  const headers = (h: Record<string, string>) => new Headers(h);

  it('the secret key in apikey is the watchdog or a script', () => {
    expect(callerFromHeaders(headers({ apikey: SECRET }), secrets)).toEqual({ kind: 'service' });
  });

  it('the legacy service role key as a Bearer token also counts', () => {
    expect(callerFromHeaders(headers({ authorization: `Bearer ${LEGACY}` }), secrets)).toEqual({
      kind: 'service',
    });
  });

  it('the publishable key with a user token is a user call', () => {
    expect(
      callerFromHeaders(
        headers({ apikey: PUBLISHABLE, authorization: 'Bearer user.jwt.token' }),
        secrets,
      ),
    ).toEqual({ kind: 'user', token: 'user.jwt.token' });
  });

  it('the publishable key alone, a wrong key or nothing is no caller', () => {
    expect(callerFromHeaders(headers({ apikey: PUBLISHABLE }), secrets)).toEqual({ kind: 'none' });
    expect(callerFromHeaders(headers({ apikey: `${SECRET}x` }), secrets)).toEqual({ kind: 'none' });
    expect(callerFromHeaders(headers({}), secrets)).toEqual({ kind: 'none' });
  });

  it('an empty apikey never matches, even with no secret configured', () => {
    expect(callerFromHeaders(headers({ apikey: '' }), [])).toEqual({ kind: 'none' });
    expect(callerFromHeaders(headers({ apikey: SECRET }), [])).toEqual({ kind: 'none' });
  });

  it('parses Bearer case-insensitively and ignores other schemes', () => {
    expect(bearerToken('bearer abc')).toBe('abc');
    expect(bearerToken('Basic abc')).toBe('');
    expect(bearerToken(null)).toBe('');
  });

  it('safeEqual compares whole strings', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('user access', () => {
  const order = { assignee_id: 'worker-1' };

  it('no valid session is 401', () => {
    expect(decideUserAccess(null, order)).toEqual({
      ok: false,
      status: 401,
      error: 'UNAUTHORIZED',
    });
  });

  it('the assignee may verify their own order', () => {
    expect(decideUserAccess({ id: 'worker-1', role: 'worker' }, order)).toEqual({ ok: true });
  });

  it('another worker may not, and an unknown order looks the same to a worker', () => {
    expect(decideUserAccess({ id: 'worker-2', role: 'worker' }, order)).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(decideUserAccess({ id: 'worker-2', role: 'worker' }, null)).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(decideUserAccess({ id: 'worker-2', role: null }, order)).toMatchObject({
      ok: false,
      status: 403,
    });
  });

  it('master, manager and admin may verify any order', () => {
    for (const role of ['master', 'manager', 'admin'])
      expect(decideUserAccess({ id: 'staff', role }, order)).toEqual({ ok: true });
  });
});
