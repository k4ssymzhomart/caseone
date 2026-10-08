// Where the budget guard reads the money already spent and where calls are logged.
// Edge Functions: the llm_audit table through PostgREST with the secret key.
// Scripts: a JSON ledger (.secrets/llm-ledger.json); the caller passes read and write, so no Node globals here.

import type { LlmAuditRequest, LlmAuditResponse, LlmAuditSink } from './llm.ts';

export interface Ledger {
  spentUsd(): Promise<number>;
  audit: LlmAuditSink;
}

export interface LedgerEntry {
  at: string;
  purpose: string;
  model: string;
  cost_usd: number;
  latency_ms: number;
  input_tokens: number;
  output_tokens: number;
  error?: string;
}

export interface LedgerFile {
  version: 1;
  total_usd: number;
  entries: LedgerEntry[];
}

function usageOf(response: unknown): { input_tokens: number; output_tokens: number } {
  const u = (
    (response ?? {}) as { usage?: { input_tokens?: unknown; output_tokens?: unknown } | null }
  ).usage;
  const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return { input_tokens: n(u?.input_tokens), output_tokens: n(u?.output_tokens) };
}

function errorOf(response: unknown): string | undefined {
  const e = ((response ?? {}) as { error?: unknown }).error;
  return typeof e === 'string' ? e : undefined;
}

export function parseLedger(text: string | null): LedgerFile {
  if (!text) return { version: 1, total_usd: 0, entries: [] };
  const raw = JSON.parse(text) as Partial<LedgerFile>;
  const entries = Array.isArray(raw.entries) ? raw.entries : [];
  return { version: 1, total_usd: sumCost(entries), entries };
}

function sumCost(entries: readonly { cost_usd?: unknown }[]): number {
  const total = entries.reduce((s, e) => s + (typeof e.cost_usd === 'number' ? e.cost_usd : 0), 0);
  return Math.round(total * 1_000_000) / 1_000_000;
}

/** A JSON ledger behind caller supplied file access. The total is recomputed from the entries on every read. */
export function jsonFileLedger(io: {
  read(): Promise<string | null>;
  write(text: string): Promise<void>;
  now?: () => Date;
}): Ledger {
  const now = io.now ?? (() => new Date());
  return {
    async spentUsd() {
      return parseLedger(await io.read()).total_usd;
    },
    audit: {
      async finish(_id: number | string | null, row: LlmAuditResponse) {
        const ledger = parseLedger(await io.read());
        const usage = usageOf(row.response_redacted);
        const error = errorOf(row.response_redacted);
        ledger.entries.push({
          at: now().toISOString(),
          purpose: row.purpose,
          model: row.model,
          cost_usd: row.cost_usd,
          latency_ms: row.latency_ms,
          ...usage,
          ...(error ? { error } : {}),
        });
        ledger.total_usd = sumCost(ledger.entries);
        await io.write(`${JSON.stringify(ledger, null, 2)}\n`);
      },
    },
  };
}

/** llm_audit through PostgREST. `secretKey` is the project secret key (or the legacy service role JWT). */
export function supabaseLedger(opts: {
  url: string;
  secretKey: string;
  fetch?: typeof fetch;
}): Ledger {
  const fetchFn = opts.fetch ?? ((input, init) => fetch(input, init));
  const base = `${opts.url.replace(/\/+$/, '')}/rest/v1/llm_audit`;
  const headers: Record<string, string> = {
    apikey: opts.secretKey,
    'content-type': 'application/json',
  };
  // Legacy JWT keys also go in Authorization; the new sb_secret_ keys are not JWTs and go in apikey only.
  if (opts.secretKey.startsWith('eyJ')) headers.authorization = `Bearer ${opts.secretKey}`;

  return {
    async spentUsd() {
      let total = 0;
      const page = 1000;
      for (let offset = 0; ; offset += page) {
        const res = await fetchFn(
          `${base}?select=cost_usd&cost_usd=not.is.null&order=id&limit=${page}&offset=${offset}`,
          {
            headers,
          },
        );
        if (!res.ok) throw new Error(`llm_audit read failed: HTTP ${res.status}`);
        const rows = (await res.json()) as { cost_usd: number | string | null }[];
        for (const r of rows) total += Number(r.cost_usd ?? 0) || 0;
        if (rows.length < page) break;
      }
      return Math.round(total * 1_000_000) / 1_000_000;
    },
    audit: {
      async start(row: LlmAuditRequest) {
        const res = await fetchFn(`${base}?select=id`, {
          method: 'POST',
          headers: { ...headers, prefer: 'return=representation' },
          body: JSON.stringify({
            purpose: row.purpose,
            model: row.model,
            request_redacted: row.request_redacted,
          }),
        });
        if (!res.ok) throw new Error(`llm_audit insert failed: HTTP ${res.status}`);
        const rows = (await res.json()) as { id: number }[];
        return rows[0]?.id ?? null;
      },
      async finish(id: number | string | null, row: LlmAuditResponse) {
        const patch = {
          model: row.model,
          response_redacted: row.response_redacted,
          latency_ms: row.latency_ms,
          cost_usd: row.cost_usd,
        };
        const res =
          id === null
            ? await fetchFn(base, {
                method: 'POST',
                headers: { ...headers, prefer: 'return=minimal' },
                body: JSON.stringify({
                  purpose: row.purpose,
                  request_redacted: row.request_redacted,
                  ...patch,
                }),
              })
            : await fetchFn(`${base}?id=eq.${encodeURIComponent(String(id))}`, {
                method: 'PATCH',
                headers: { ...headers, prefer: 'return=minimal' },
                body: JSON.stringify(patch),
              });
        if (!res.ok) throw new Error(`llm_audit write failed: HTTP ${res.status}`);
      },
    },
  };
}
