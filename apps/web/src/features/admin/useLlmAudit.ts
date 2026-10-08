// llm_audit for «Что видит ИИ» (CLAUDE.md §16). RotaApi has no audit read yet, so this hook reads the table with the
// panel's Supabase client (RLS: managers and admins). In mock mode the AI never leaves the browser and there is no
// journal: both hooks answer an empty list. When RotaApi gains ai.audit(), only this file changes.
//
//   const list = useLlmAudit();        // the latest 50 rows with the redacted payloads
//   const stats = useLlmAuditStats();  // purpose, cost, latency and error of every row (light columns only)
import { RotaError, type Json } from '@rota/shared';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/api';

export interface LlmAuditRow {
  id: number;
  created_at: string;
  purpose: string;
  model: string | null;
  request_redacted: Json | null;
  response_redacted: Json | null;
  latency_ms: number | null;
  cost_usd: number | null;
}

export interface LlmAuditStat {
  purpose: string;
  latency_ms: number | null;
  cost_usd: number | null;
  /** response_redacted.error: the LlmError code when the call failed. */
  error: string | null;
  /** false while the call has no response yet (or it never came). */
  answered: boolean;
}

/** The table is not in the realtime publication: poll while the page is open. */
const POLL_MS = 15_000;

interface PgError {
  code?: string;
  message?: string;
}

function toRotaError(error: PgError, status: number): RotaError {
  const message = [error.code, error.message].filter(Boolean).join(': ');
  if (status === 0 || /fetch|network/i.test(error.message ?? '')) return new RotaError('NETWORK', { details: message });
  if (status === 401 || status === 403 || error.code === '42501') return new RotaError('FORBIDDEN', { details: message });
  return new RotaError('UNKNOWN', { details: message });
}

export const llmAuditKey = (...parts: unknown[]) => ['llm_audit', ...parts] as const;

export function useLlmAudit(limit = 50) {
  return useQuery({
    queryKey: llmAuditKey('list', limit),
    queryFn: async (): Promise<LlmAuditRow[]> => {
      if (!supabase) return [];
      const { data, error, status } = await supabase
        .from('llm_audit')
        .select('id, created_at, purpose, model, request_redacted, response_redacted, latency_ms, cost_usd')
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(limit);
      if (error) throw toRotaError(error, status);
      return data ?? [];
    },
    refetchInterval: POLL_MS,
  });
}

export function useLlmAuditStats() {
  return useQuery({
    queryKey: llmAuditKey('stats'),
    queryFn: async (): Promise<LlmAuditStat[]> => {
      if (!supabase) return [];
      const { data, error, status } = await supabase
        .from('llm_audit')
        .select('purpose, latency_ms, cost_usd, error:response_redacted->>error, answered:response_redacted->>usage')
        .order('created_at', { ascending: false })
        .limit(1000);
      if (error) throw toRotaError(error, status);
      const rows = (data ?? []) as unknown as {
        purpose: string;
        latency_ms: number | null;
        cost_usd: number | string | null;
        error: string | null;
        answered: string | null;
      }[];
      return rows.map((r) => ({
        purpose: r.purpose,
        latency_ms: r.latency_ms,
        cost_usd: r.cost_usd == null ? null : Number(r.cost_usd),
        error: r.error,
        answered: r.answered != null || r.error != null,
      }));
    },
    refetchInterval: POLL_MS,
  });
}
