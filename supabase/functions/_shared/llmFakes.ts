// Test helpers for the functions that call the LLM: a fake Anthropic endpoint and the config that points at it.
// Imported by tests only, never deployed.

import type { LlmAuditRequest, LlmConfig } from './llm.ts';

/** Anthropic answers: a list of [status, body] consumed in order; records every request body. */
export function anthropicFetch(replies: [number, unknown][]) {
  const bodies: Record<string, unknown>[] = [];
  const fetchFn = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
    const [status, body] = replies.shift() ?? [
      500,
      { error: { type: 'api_error', message: 'none left' } },
    ];
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return { fetchFn, bodies };
}

/** A message whose text block holds `json`, after a thinking block (as Sonnet 5.5 answers). */
export function anthropicReply(json: unknown, model = 'claude-sonnet-5-5') {
  return {
    id: 'msg',
    type: 'message',
    role: 'assistant',
    model,
    stop_reason: 'end_turn',
    content: [
      { type: 'thinking', thinking: '', signature: 's' },
      { type: 'text', text: JSON.stringify(json) },
    ],
    usage: { input_tokens: 2000, output_tokens: 400 },
  };
}

export function anthropicConfig(
  fetchFn: typeof fetch,
  spent = 0.001,
  audits: LlmAuditRequest[] = [],
): () => LlmConfig {
  return () => ({
    provider: 'anthropic',
    apiKey: 'test-key',
    budgetUsd: 4,
    spentUsd: () => spent,
    fetch: fetchFn,
    audit: {
      start: (row) => {
        audits.push(row);
        return audits.length;
      },
      finish: () => {},
    },
  });
}
