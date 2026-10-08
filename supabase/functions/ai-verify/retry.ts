// Retry policy of the one verify call (CLAUDE.md §11 step 3): up to 3 attempts on network errors, 5xx and 429,
// timeouts and unparsable answers; never on BUDGET_EXCEEDED, CONFIG, REFUSAL, MAX_TOKENS or other 4xx.
// The whole LLM stage stays inside a deadline, so the function ends well before the Edge wall clock limit.

import { DEFAULT_TIMEOUT_MS, isLlmError, LlmError, type LlmErrorCode } from '../_shared/llm.ts';

export interface RetryPolicy {
  maxAttempts: number;
  /** Pause before attempt n + 1 is baseDelayMs × n. */
  baseDelayMs: number;
  /** Timeout of one call (CLAUDE.md §2: 45 s). */
  attemptTimeoutMs: number;
  /** The whole LLM stage, retries and pauses included. */
  deadlineMs: number;
  /** No new attempt starts with less time than this left. */
  minAttemptMs: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  attemptTimeoutMs: DEFAULT_TIMEOUT_MS,
  deadlineMs: 100_000,
  minAttemptMs: 15_000,
};

const RETRYABLE_STATUS: ReadonlySet<number> = new Set([408, 429]);

export function isRetryable(e: unknown): boolean {
  if (!isLlmError(e)) return true;
  switch (e.code) {
    case 'NETWORK':
    case 'TIMEOUT':
    case 'BAD_RESPONSE':
      return true;
    case 'HTTP':
      return e.status === null || e.status >= 500 || RETRYABLE_STATUS.has(e.status);
    default:
      return false;
  }
}

export interface RetryClock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const realClock: RetryClock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export type RetryOutcome<T> =
  | { ok: true; value: T; tries: number; elapsedMs: number }
  | { ok: false; error: LlmError; tries: number; elapsedMs: number };

function asLlmError(e: unknown): LlmError {
  if (e instanceof LlmError) return e;
  return new LlmError(
    'BAD_RESPONSE',
    `BAD_RESPONSE: ${e instanceof Error ? e.message : String(e)}`,
  );
}

/**
 * Runs `fn(attempt, timeoutMs)` until it succeeds, fails with a final error, runs out of attempts
 * or the deadline leaves less than minAttemptMs. Never throws: the caller writes a rules-only review on failure.
 */
export async function withRetries<T>(
  fn: (attempt: number, timeoutMs: number) => Promise<T>,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
  clock: RetryClock = realClock,
  onRetry?: (attempt: number, error: LlmError) => void,
): Promise<RetryOutcome<T>> {
  const t0 = clock.now();
  let last: LlmError = new LlmError('TIMEOUT', 'TIMEOUT: no attempt fitted in the deadline');
  let tries = 0;
  for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
    const left = policy.deadlineMs - (clock.now() - t0);
    if (attempt > 1 && left < policy.minAttemptMs) break;
    tries = attempt;
    try {
      const value = await fn(attempt, Math.max(1000, Math.min(policy.attemptTimeoutMs, left)));
      return { ok: true, value, tries, elapsedMs: clock.now() - t0 };
    } catch (e) {
      last = asLlmError(e);
      if (!isRetryable(last) || attempt === policy.maxAttempts) break;
      onRetry?.(attempt, last);
      const pause = policy.baseDelayMs * attempt;
      if (policy.deadlineMs - (clock.now() - t0) - pause < policy.minAttemptMs) break;
      await clock.sleep(pause);
    }
  }
  return { ok: false, error: last, tries, elapsedMs: clock.now() - t0 };
}

/**
 * ai_submit writes «не выполнено: {error}» into the L1 check that the worker and the master read,
 * so the error goes in as a short Russian phrase; the code travels separately as error_code.
 */
export const ERROR_LABEL_RU: Readonly<Record<LlmErrorCode, string>> = {
  BUDGET_EXCEEDED: 'бюджет ИИ исчерпан',
  TIMEOUT: 'ИИ не ответил вовремя',
  HTTP: 'сервис ИИ недоступен',
  NETWORK: 'нет связи с сервисом ИИ',
  REFUSAL: 'ИИ отказался оценивать наряд',
  MAX_TOKENS: 'ответ ИИ оборван',
  BAD_RESPONSE: 'ответ ИИ не распознан',
  CONFIG: 'ИИ не настроен',
};

export function errorLabelRu(e: unknown): string {
  return isLlmError(e) ? ERROR_LABEL_RU[e.code] : 'ИИ недоступен';
}
