// Who may start an AI check (CLAUDE.md §9 item 5, §11). ai-verify runs with verify_jwt = false, so it decides here:
// - the project secret key in `apikey` (or as a Bearer token): the watchdog retry through pg_net, scripts;
// - otherwise a user session (Authorization: Bearer <access token>, checked with auth.getUser):
//   the order's assignee, or staff (master, manager, admin from app_metadata.app_role).
// Pure functions, no Deno or Node globals.

import type { EnvGetter } from '../_shared/env.ts';

export type Caller = { kind: 'service' } | { kind: 'user'; token: string } | { kind: 'none' };

export interface VerifyUser {
  id: string;
  /** app_metadata.app_role: master, worker, manager, admin. */
  role: string | null;
}

export const STAFF_ROLES: ReadonlySet<string> = new Set(['master', 'manager', 'admin']);

/**
 * Every value that counts as the project secret key: each key of SUPABASE_SECRET_KEYS (JSON map, `default` first),
 * then the legacy SUPABASE_SERVICE_ROLE_KEY and SUPABASE_SECRET_KEY. Empty values are dropped.
 */
export function secretKeyCandidates(get: EnvGetter): string[] {
  const out: string[] = [];
  const raw = get('SUPABASE_SECRET_KEYS');
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (typeof parsed.default === 'string') out.push(parsed.default);
      for (const v of Object.values(parsed)) if (typeof v === 'string') out.push(v);
    } catch {
      // a malformed value is ignored; the legacy keys below still work
    }
  }
  out.push(get('SUPABASE_SERVICE_ROLE_KEY') ?? '', get('SUPABASE_SECRET_KEY') ?? '');
  return [...new Set(out.filter((k) => k.length > 0))];
}

/** Compares without an early exit on the first different character. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function isSecret(value: string, secrets: readonly string[]): boolean {
  if (!value) return false;
  let hit = false;
  for (const s of secrets) if (safeEqual(value, s)) hit = true;
  return hit;
}

export function bearerToken(authorization: string | null): string {
  const m = /^Bearer\s+(\S+)\s*$/i.exec(authorization ?? '');
  return m?.[1] ?? '';
}

/** Classifies the request by its headers. The publishable key in `apikey` is not a credential by itself. */
export function callerFromHeaders(headers: Headers, secrets: readonly string[]): Caller {
  const apikey = headers.get('apikey') ?? '';
  const token = bearerToken(headers.get('authorization'));
  if (isSecret(apikey, secrets) || isSecret(token, secrets)) return { kind: 'service' };
  if (token) return { kind: 'user', token };
  return { kind: 'none' };
}

export type AccessDecision = { ok: true } | { ok: false; status: 401 | 403; error: string };

/** A signed-in user may verify an order they are assigned to; staff may verify any order. */
export function decideUserAccess(
  user: VerifyUser | null,
  order: { assignee_id: string | null } | null,
): AccessDecision {
  if (!user) return { ok: false, status: 401, error: 'UNAUTHORIZED' };
  if (user.role && STAFF_ROLES.has(user.role)) return { ok: true };
  if (order && order.assignee_id && order.assignee_id === user.id) return { ok: true };
  return { ok: false, status: 403, error: 'FORBIDDEN' };
}
