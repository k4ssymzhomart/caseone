// Supabase errors → RotaError (PHASE_1 §6). The state machine raises its code as the message with errcode P0001
// and the context in detail (JSON {order_id, number} for ANOTHER_IN_PROGRESS, the worker's short name for
// NOT_ON_SHIFT). 42501 and an expired or missing JWT are FORBIDDEN; auth invalid_credentials is WRONG_PIN;
// anything that never reached the server is NETWORK. Duck typed, so the package needs no supabase-js at runtime.

import { isErrorCode, isRotaError, RotaError } from '../errors';

/** The shape of a PostgrestError (and of the error object postgrest-js returns for a failed fetch). */
export interface PgErrorLike {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
}

/** AuthError, AuthApiError, AuthRetryableFetchError. */
export interface AuthErrorLike {
  name?: string;
  code?: string;
  status?: number;
  message?: string;
}

/** StorageApiError, StorageUnknownError. */
export interface StorageErrorLike {
  name?: string;
  status?: number;
  statusCode?: string | number;
  message?: string;
}

const NETWORK_TEXT =
  /fetch|network|abort|timed? ?out|socket|ECONN|ENOTFOUND|EAI_AGAIN|load failed/i;
const NETWORK_STATUS = new Set([0, 408, 502, 503, 504, 520, 521, 522, 523, 524]);
const JWT_CODES = new Set(['PGRST301', 'PGRST302', 'PGRST303']);
const WRONG_PIN_CODES = new Set([
  'invalid_credentials',
  'validation_failed',
  'email_address_invalid',
  'user_not_found',
]);

function describe(e: { code?: string | null; message?: string | null }): string {
  return [e.code, e.message].filter((x) => x != null && x !== '').join(': ');
}

/** A PostgREST error, with the HTTP status of the response when known (0 = the request never got an answer). */
export function fromPostgrest(error: PgErrorLike, status?: number): RotaError {
  const code = error.code ?? '';
  const message = error.message ?? '';
  const details = error.details ?? undefined;
  if (code === 'P0001' && isErrorCode(message)) {
    return new RotaError(message, details == null ? { cause: error } : { details, cause: error });
  }
  if (code === '42501') return new RotaError('FORBIDDEN', { details: message, cause: error });
  if (status === 401 || JWT_CODES.has(code)) {
    return new RotaError('FORBIDDEN', { details: 'sign in required', cause: error });
  }
  if (
    (status != null && NETWORK_STATUS.has(status)) ||
    (code === '' && NETWORK_TEXT.test(message))
  ) {
    return new RotaError('NETWORK', { details: message, cause: error });
  }
  if (code === 'PGRST116')
    return new RotaError('BAD_INPUT', { details: 'not found', cause: error });
  if (code.startsWith('22') || code.startsWith('23')) {
    return new RotaError('BAD_INPUT', { details: describe(error), cause: error });
  }
  return new RotaError('UNKNOWN', { details: describe(error), cause: error });
}

export function fromAuth(error: AuthErrorLike): RotaError {
  const status = error.status;
  if (
    error.name === 'AuthRetryableFetchError' ||
    (status != null && NETWORK_STATUS.has(status)) ||
    (status == null && NETWORK_TEXT.test(error.message ?? ''))
  ) {
    return new RotaError('NETWORK', { details: error.message, cause: error });
  }
  if (
    (error.code != null && WRONG_PIN_CODES.has(error.code)) ||
    (status === 400 && error.code == null)
  ) {
    return new RotaError('WRONG_PIN', { cause: error });
  }
  if (error.name === 'AuthSessionMissingError' || status === 401 || status === 403) {
    return new RotaError('FORBIDDEN', { details: 'sign in required', cause: error });
  }
  return new RotaError('UNKNOWN', { details: describe(error), cause: error });
}

/** Storage answers an RLS denial with HTTP 400 and statusCode '403', so both fields count. */
export function fromStorage(error: StorageErrorLike): RotaError {
  const http = error.status;
  const inner = Number(error.statusCode);
  const opts = { details: error.message, cause: error };
  if (http == null && !Number.isFinite(inner)) {
    const offline = error.name === 'StorageUnknownError' || NETWORK_TEXT.test(error.message ?? '');
    return new RotaError(offline ? 'NETWORK' : 'UNKNOWN', opts);
  }
  if ((http != null && NETWORK_STATUS.has(http)) || NETWORK_STATUS.has(inner)) {
    return new RotaError('NETWORK', opts);
  }
  if (http === 401 || http === 403 || inner === 401 || inner === 403) {
    return new RotaError('FORBIDDEN', opts);
  }
  const status = http ?? inner;
  if (status >= 400 && status < 500) return new RotaError('BAD_INPUT', opts);
  return new RotaError('UNKNOWN', opts);
}

/** Storage answers «not found» for an unknown path (400 or 404 with a «not found» message). */
export function isStorageNotFound(error: StorageErrorLike): boolean {
  const status = error.status ?? Number(error.statusCode);
  return status === 404 || /not.?found/i.test(error.message ?? '');
}

/** An exception thrown by fetch or the client (not a returned error object). */
export function fromThrown(e: unknown): RotaError {
  if (isRotaError(e)) return e;
  const err = e as { name?: string; message?: string } | null;
  const message = err?.message ?? String(e);
  if (err?.name === 'TypeError' || err?.name === 'AbortError' || NETWORK_TEXT.test(message)) {
    return new RotaError('NETWORK', { details: message, cause: e });
  }
  return new RotaError('UNKNOWN', { details: message, cause: e });
}
