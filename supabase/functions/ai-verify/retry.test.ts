import { describe, expect, it } from 'vitest';
import { LlmError } from '../_shared/llm.ts';
import {
  DEFAULT_RETRY_POLICY,
  errorLabelRu,
  isRetryable,
  withRetries,
  type RetryClock,
  type RetryPolicy,
} from './retry.ts';

const http = (status: number) => new LlmError('HTTP', `HTTP ${status}`, { status });

/** A clock where time only moves when the code under test sleeps or an attempt "takes" time. */
function fakeClock(): RetryClock & { t: number; sleeps: number[] } {
  const c = {
    t: 0,
    sleeps: [] as number[],
    now: () => c.t,
    sleep: async (ms: number) => {
      c.sleeps.push(ms);
      c.t += ms;
    },
  };
  return c;
}

const policy: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  attemptTimeoutMs: 45_000,
  deadlineMs: 100_000,
  minAttemptMs: 15_000,
};

describe('retryable errors', () => {
  it('network, timeout, unparsable answers, 5xx, 529 and 429 are retried', () => {
    expect(isRetryable(new LlmError('NETWORK', 'x'))).toBe(true);
    expect(isRetryable(new LlmError('TIMEOUT', 'x'))).toBe(true);
    expect(isRetryable(new LlmError('BAD_RESPONSE', 'x'))).toBe(true);
    expect(isRetryable(http(500))).toBe(true);
    expect(isRetryable(http(529))).toBe(true);
    expect(isRetryable(http(429))).toBe(true);
  });

  it('budget, config, refusal, max tokens and other 4xx are final', () => {
    expect(isRetryable(new LlmError('BUDGET_EXCEEDED', 'x'))).toBe(false);
    expect(isRetryable(new LlmError('CONFIG', 'x'))).toBe(false);
    expect(isRetryable(new LlmError('REFUSAL', 'x'))).toBe(false);
    expect(isRetryable(new LlmError('MAX_TOKENS', 'x'))).toBe(false);
    expect(isRetryable(http(400))).toBe(false);
    expect(isRetryable(http(401))).toBe(false);
  });
});

describe('withRetries', () => {
  it('succeeds on the third attempt after transient errors, with growing pauses', async () => {
    const clock = fakeClock();
    const errors = [new LlmError('NETWORK', 'x'), http(503)];
    const seen: number[] = [];
    const out = await withRetries(
      async (attempt) => {
        seen.push(attempt);
        const e = errors.shift();
        if (e) throw e;
        return 'ok';
      },
      policy,
      clock,
    );
    expect(out).toMatchObject({ ok: true, value: 'ok', tries: 3 });
    expect(seen).toEqual([1, 2, 3]);
    expect(clock.sleeps).toEqual([1000, 2000]);
  });

  it('stops at once on BUDGET_EXCEEDED', async () => {
    let calls = 0;
    const out = await withRetries(
      async () => {
        calls++;
        throw new LlmError('BUDGET_EXCEEDED', 'x');
      },
      policy,
      fakeClock(),
    );
    expect(calls).toBe(1);
    expect(out).toMatchObject({ ok: false, tries: 1 });
    if (!out.ok) expect(out.error.code).toBe('BUDGET_EXCEEDED');
  });

  it('gives up after 3 attempts and returns the last error', async () => {
    let calls = 0;
    const out = await withRetries(
      async () => {
        calls++;
        throw new LlmError('TIMEOUT', `t${calls}`);
      },
      policy,
      fakeClock(),
    );
    expect(calls).toBe(3);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.message).toBe('t3');
  });

  it('keeps the whole stage inside the deadline: two 45 s timeouts leave no room for a third', async () => {
    const clock = fakeClock();
    const timeouts: number[] = [];
    const out = await withRetries(
      async (_attempt, timeoutMs) => {
        timeouts.push(timeoutMs);
        clock.t += timeoutMs;
        throw new LlmError('TIMEOUT', 'x');
      },
      policy,
      clock,
    );
    expect(timeouts).toEqual([45_000, 45_000]);
    expect(out).toMatchObject({ ok: false, tries: 2 });
    expect(clock.t).toBeLessThanOrEqual(policy.deadlineMs);
  });

  it('shortens the last attempt to the time left', async () => {
    const clock = fakeClock();
    const timeouts: number[] = [];
    await withRetries(
      async (attempt, timeoutMs) => {
        timeouts.push(timeoutMs);
        clock.t += attempt === 1 ? 60_000 : timeoutMs;
        throw new LlmError('NETWORK', 'x');
      },
      policy,
      clock,
    );
    expect(timeouts).toEqual([45_000, 39_000]);
  });

  it('default policy: one 45 s timeout ends the stage, so the function answers within 50 s', async () => {
    const clock = fakeClock();
    const out = await withRetries(
      async (_attempt, timeoutMs) => {
        clock.t += timeoutMs;
        throw new LlmError('TIMEOUT', 'x');
      },
      DEFAULT_RETRY_POLICY,
      clock,
    );
    expect(out).toMatchObject({ ok: false, tries: 1 });
    expect(clock.t).toBeLessThanOrEqual(DEFAULT_RETRY_POLICY.deadlineMs);
    // the app waits 60 s (AI_VERIFY_TIMEOUT_MS) and the watchdog 60 s: the stage plus I/O must fit under both
    expect(DEFAULT_RETRY_POLICY.deadlineMs).toBeLessThanOrEqual(50_000);
  });

  it('default policy: fast failures still get all 3 attempts', async () => {
    const clock = fakeClock();
    let calls = 0;
    const out = await withRetries(
      async () => {
        calls++;
        clock.t += 2000;
        throw http(529);
      },
      DEFAULT_RETRY_POLICY,
      clock,
    );
    expect(calls).toBe(3);
    expect(out.ok).toBe(false);
  });

  it('wraps unexpected exceptions as BAD_RESPONSE', async () => {
    const out = await withRetries(
      async () => {
        throw new Error('boom');
      },
      { ...policy, maxAttempts: 1 },
      fakeClock(),
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe('BAD_RESPONSE');
  });
});

describe('error labels for the rules-only review', () => {
  it('are short Russian phrases without dashes', () => {
    for (const code of [
      'BUDGET_EXCEEDED',
      'TIMEOUT',
      'HTTP',
      'NETWORK',
      'REFUSAL',
      'MAX_TOKENS',
      'BAD_RESPONSE',
      'CONFIG',
    ] as const) {
      const label = errorLabelRu(new LlmError(code, 'x'));
      expect(label).toMatch(/^[а-яёА-ЯЁ ]+$/u);
    }
    expect(errorLabelRu(new Error('x'))).toBe('ИИ недоступен');
  });
});
