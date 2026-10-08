// RotaError: every failure the apps show. The database raises the code as the message (P0001) with
// context in details (PHASE_1 §6); SupabaseApi and MockApi both throw RotaError.

import { t, type I18nKey, type I18nParams } from '../i18n';

export const ERROR_CODES = [
  'FORBIDDEN',
  'BAD_TRANSITION',
  'MISSING_REASON',
  'ANOTHER_IN_PROGRESS',
  'NOT_ON_SHIFT',
  'BAD_INPUT',
  'BUDGET_EXCEEDED',
  'WRONG_PIN',
  'NETWORK',
  'UNKNOWN',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && (ERROR_CODES as readonly string[]).includes(value);
}

/** details of ANOTHER_IN_PROGRESS: the order in progress that would be paused. */
export interface AnotherInProgressDetails {
  order_id: number;
  number: number;
}

export interface RotaErrorOptions {
  /** Context from the server (text, or parsed JSON for ANOTHER_IN_PROGRESS). */
  details?: unknown;
  /** Placeholders for the Russian message, e.g. { name } or { number }. */
  params?: I18nParams;
  /** Overrides the Russian message. */
  message?: string;
  cause?: unknown;
}

export class RotaError extends Error {
  readonly code: ErrorCode;
  readonly details: unknown;

  constructor(code: ErrorCode, options: RotaErrorOptions = {}) {
    super(
      options.message ??
        errorMessage(code, options.params ?? paramsFromDetails(code, options.details)),
      options.cause !== undefined ? { cause: options.cause } : undefined,
    );
    this.name = 'RotaError';
    this.code = code;
    this.details = options.details;
  }
}

export function isRotaError(e: unknown): e is RotaError {
  return e instanceof RotaError;
}

/** The Russian message for a code; NOT_ON_SHIFT without a name uses the generic wording. */
export function errorMessage(code: ErrorCode, params?: I18nParams): string {
  if (code === 'NOT_ON_SHIFT' && !params?.name) return t('error.NOT_ON_SHIFT_GENERIC');
  return t(`error.${code}` as I18nKey, params);
}

function paramsFromDetails(code: ErrorCode, details: unknown): I18nParams | undefined {
  if (code === 'NOT_ON_SHIFT' && typeof details === 'string' && details !== 'NOT_ON_SHIFT') {
    return { name: details };
  }
  if (code === 'ANOTHER_IN_PROGRESS') {
    const d = parseAnotherInProgress(details);
    if (d) return { number: d.number };
  }
  return undefined;
}

/** Reads {order_id, number} from ANOTHER_IN_PROGRESS details (an object or its JSON text). */
export function parseAnotherInProgress(details: unknown): AnotherInProgressDetails | null {
  let value = details;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>;
    const orderId = Number(v.order_id);
    const number = Number(v.number);
    if (Number.isFinite(orderId) && Number.isFinite(number)) return { order_id: orderId, number };
  }
  return null;
}
