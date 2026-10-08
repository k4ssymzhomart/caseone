// Who calls a function signed in as a user (ai-shift-summary, ai-explain-rating; CLAUDE.md §18): the access token
// from `Authorization: Bearer …`, the role from app_metadata.app_role, and the database errors those calls map to
// HTTP statuses. Pure, no Deno or Node globals.

export const STAFF_ROLES: ReadonlySet<string> = new Set(['master', 'manager', 'admin']);

export function bearerToken(authorization: string | null): string {
  const m = /^Bearer\s+(\S+)\s*$/i.exec(authorization ?? '');
  return m?.[1] ?? '';
}

/** app_metadata.app_role of an auth user: master, worker, manager, admin; null when absent. */
export function roleOf(appMetadata: unknown): string | null {
  const role = (appMetadata as Record<string, unknown> | null | undefined)?.app_role;
  return typeof role === 'string' && role ? role : null;
}

/** A database error; `message` holds the RPC error code (FORBIDDEN, BAD_INPUT …), `code` the SQLSTATE or PGRST code. */
export class DbError extends Error {
  readonly code: string | null;
  constructor(message: string, code: string | null = null) {
    super(message);
    this.name = 'DbError';
    this.code = code;
  }
}

/** 401 for a token PostgREST refused, 403 for FORBIDDEN or a missing grant, 400 for BAD_INPUT, else 500. */
export function dbErrorStatus(e: unknown): 400 | 401 | 403 | 500 {
  const message = e instanceof Error ? e.message : '';
  const code = e instanceof DbError ? (e.code ?? '') : '';
  if (/^PGRST30\d$/.test(code) || /JWT/i.test(message)) return 401;
  if (message.startsWith('FORBIDDEN') || code === '42501') return 403;
  if (message.startsWith('BAD_INPUT')) return 400;
  return 500;
}

export function dbErrorCode(status: number): string {
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 400) return 'BAD_INPUT';
  return 'INTERNAL';
}
